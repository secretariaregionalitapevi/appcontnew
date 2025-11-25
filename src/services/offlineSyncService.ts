import NetInfo from '@react-native-community/netinfo';
import { supabaseDataService } from './supabaseDataService';
import { googleSheetsService } from './googleSheetsService';
import { RegistroPresenca } from '../types/models';
import { authService } from './authService';
import { uuidv4 } from '../utils/uuid';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const offlineSyncService = {
  async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable === true;
  },

  async syncAllData(): Promise<{ success: boolean; error?: string; syncResult?: { successCount: number; totalCount: number } }> {
    const isOnline = await this.isOnline();
    if (!isOnline) {
      // Não é um erro crítico, apenas informativo
      return { success: false, error: 'Sem conexão com a internet' };
    }

    try {
      // Verificar se a sessão é válida ANTES de tentar sincronizar
      const sessionValid = await authService.isSessionValid();
      if (!sessionValid) {
        // Não é um erro crítico se não há sessão válida
        return { success: false, error: 'Sessão expirada. Faça login novamente.' };
      }

      // Sincronizar dados de referência (com tratamento de erro individual para não quebrar tudo)
      try {
        await supabaseDataService.syncComunsToLocal();
      } catch (error) {
        console.warn(
          '⚠️ Erro ao sincronizar comuns (continuando...):',
          error instanceof Error ? error.message : error
        );
      }

      try {
        await supabaseDataService.syncCargosToLocal();
      } catch (error) {
        console.warn(
          '⚠️ Erro ao sincronizar cargos (continuando...):',
          error instanceof Error ? error.message : error
        );
      }

      try {
        await supabaseDataService.syncInstrumentosToLocal();
      } catch (error) {
        console.warn(
          '⚠️ Erro ao sincronizar instrumentos (continuando...):',
          error instanceof Error ? error.message : error
        );
      }

      // Pessoas são buscadas diretamente da tabela cadastro quando necessário
      // await supabaseDataService.syncPessoasToLocal(); // REMOVIDO - não existe tabela pessoas

      // Sincronizar registros pendentes
      let syncResult: { successCount: number; totalCount: number } | undefined;
      try {
        syncResult = await this.syncPendingRegistros();
      } catch (error) {
        console.warn(
          '⚠️ Erro ao sincronizar registros pendentes (continuando...):',
          error instanceof Error ? error.message : error
        );
      }

      return { success: true, syncResult };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao sincronizar dados';
      // Não logar como erro crítico se for problema de rede
      if (
        !errorMessage.toLowerCase().includes('fetch') &&
        !errorMessage.toLowerCase().includes('network')
      ) {
        console.error('❌ Erro na sincronização:', errorMessage);
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  async syncPendingRegistros(): Promise<{ successCount: number; totalCount: number }> {
    let registros = await supabaseDataService.getRegistrosPendentesFromLocal();

    // Limpar registros inválidos antes de sincronizar
    const [comuns, cargos] = await Promise.all([
      supabaseDataService.getComunsFromLocal(),
      supabaseDataService.getCargosFromLocal(),
    ]);
    
    const registrosValidos: RegistroPresenca[] = [];
    const registrosInvalidos: string[] = [];
    
    for (const registro of registros) {
      // Verificar se é registro externo (válido)
      const isExternalRegistro = registro.comum_id.startsWith('external_');
      
      if (isExternalRegistro) {
        // Registros externos são válidos
        registrosValidos.push(registro);
      } else {
        // Verificar se comum e cargo existem
        const comum = comuns.find(c => c.id === registro.comum_id);
        const cargo = cargos.find(c => c.id === registro.cargo_id);
        
        if (!comum || !cargo) {
          console.warn(`⚠️ Registro inválido detectado: ${registro.id}`, {
            comum_id: registro.comum_id,
            cargo_id: registro.cargo_id,
            comum_encontrado: !!comum,
            cargo_encontrado: !!cargo,
          });
          registrosInvalidos.push(registro.id);
          // Marcar como erro para remover da fila
          await supabaseDataService.updateRegistroStatus(registro.id, 'error');
        } else {
          registrosValidos.push(registro);
        }
      }
    }
    
    if (registrosInvalidos.length > 0) {
      console.log(`🧹 Removendo ${registrosInvalidos.length} registros inválidos da fila`);
      // Remover registros inválidos
      for (const id of registrosInvalidos) {
        try {
          await supabaseDataService.deleteRegistroFromLocal(id);
        } catch (error) {
          console.warn(`⚠️ Erro ao remover registro inválido ${id}:`, error);
        }
      }
    }
    
    registros = registrosValidos;

    if (registros.length === 0) {
      console.log('📭 Nenhum registro pendente para sincronizar');
      return { successCount: 0, totalCount: 0 };
    }

    let successCount = 0;
    const totalCount = registros.length;
    
    // 🚨 CRÍTICO: Processar SEQUENCIALMENTE (como ContPedras) para garantir que todos sejam enviados
    // Processamento paralelo pode causar falhas silenciosas no Android
    for (let i = 0; i < registros.length; i++) {
      const registro = registros[i];
      
      try {
        // Validar registro antes de enviar
        if (!registro.comum_id || !registro.cargo_id) {
          console.error(`❌ Registro ${registro.id} inválido: falta comum_id ou cargo_id`);
          await supabaseDataService.updateRegistroStatus(registro.id, 'error');
          continue;
        }

        // 🚀 FLUXO: Google Sheets PRIMEIRO (como ContPedras)
        const sheetsResult = await googleSheetsService.sendRegistroToSheet(registro);
        
        if (sheetsResult.success) {
          // Enviar para Supabase em background (não bloquear)
          supabaseDataService.createRegistroPresenca(registro, false).catch(() => {
            // Erro no Supabase não é crítico se Google Sheets OK
          });
          
          // Marcar como sincronizado
          if (registro.id) {
            await supabaseDataService.updateRegistroStatus(registro.id, 'synced');
            successCount++;
          }
        } else {
          // Google Sheets falhou - verificar tipo de erro
          if (sheetsResult.error?.includes('Dados incompletos')) {
            await supabaseDataService.updateRegistroStatus(registro.id, 'error');
            continue;
          }
          
          const isNetworkError = 
            sheetsResult.error?.includes('Failed to fetch') ||
            sheetsResult.error?.includes('Timeout') ||
            sheetsResult.error?.includes('Network') ||
            sheetsResult.error?.includes('AbortError');

          if (!isNetworkError) {
            // Tentar Supabase como fallback
            try {
              const createdRegistro = await supabaseDataService.createRegistroPresenca(registro, false);
              if (createdRegistro && registro.id) {
                await supabaseDataService.updateRegistroStatus(registro.id, 'synced');
                successCount++;
              }
            } catch (supabaseError: any) {
              const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
              if (errorMessage.includes('DUPLICATA') || errorMessage.includes('duplicat')) {
                // Duplicata - remover da fila
                if (registro.id) {
                  await supabaseDataService.deleteRegistroFromLocal(registro.id);
                  successCount++;
                }
              }
            }
          }
        }
        
        // Pausa entre envios para evitar sobrecarga (como ContPedras)
        if (i < registros.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        // Logar erro mas continuar com próximo registro
        console.error(`❌ Erro ao processar registro ${registro.id}:`, error);
      }
    }

    return { successCount, totalCount };
  },

  async createRegistro(
    registro: RegistroPresenca,
    skipDuplicateCheck = false
  ): Promise<{ success: boolean; error?: string }> {
    // 🚨 OTIMIZAÇÃO: Medir tempo de processamento
    const inicioTempo = performance.now();
    
    // Verificar status online com tratamento de erro robusto
    let isOnline = false;
    try {
      isOnline = await this.isOnline();
      console.log('🔍 Status de conexão verificado:', isOnline ? 'Online' : 'Offline');
    } catch (error) {
      console.warn('⚠️ Erro ao verificar status online, assumindo offline:', error);
      // Se houver erro na verificação, assumir offline para garantir que salve localmente
      isOnline = false;
    }

    // 🛡️ VERIFICAÇÃO DE DUPLICADOS NO SUPABASE PRIMEIRO (se online)
    // Deve verificar ANTES de salvar em qualquer lugar
    // Pular verificação se skipDuplicateCheck = true (usuário confirmou duplicata)
    if (isOnline && !skipDuplicateCheck) {
      try {
        // Buscar dados necessários para verificação
        const [comuns, cargos] = await Promise.all([
          supabaseDataService.getComunsFromLocal(),
          supabaseDataService.getCargosFromLocal(),
        ]);

        const comum = comuns.find(c => c.id === registro.comum_id);
        const cargo = cargos.find(c => c.id === registro.cargo_id);

        if (comum && cargo) {
          // Buscar pessoa para obter nome completo
          const pessoas = await supabaseDataService.getPessoasFromLocal(
            registro.comum_id,
            registro.cargo_id,
            registro.instrumento_id || undefined
          );

          let nomeCompleto = '';
          let cargoReal = cargo.nome; // Usar cargo selecionado como padrão

          if (registro.pessoa_id.startsWith('manual_')) {
            nomeCompleto = registro.pessoa_id.replace(/^manual_/, '').toUpperCase();
            // Para nomes manuais, usar cargo selecionado
            cargoReal = cargo.nome;
          } else {
            const pessoa = pessoas.find(p => p.id === registro.pessoa_id);
            if (pessoa) {
              nomeCompleto = (pessoa.nome_completo || `${pessoa.nome} ${pessoa.sobrenome}`)
                .trim()
                .toUpperCase();
              // Usar cargo real da pessoa se disponível, senão usar cargo selecionado
              cargoReal = pessoa.cargo_real || cargo.nome;
            }
          }

          const comumBusca = comum.nome.toUpperCase();
          const cargoBusca = cargoReal.toUpperCase(); // Usar cargo REAL, não o selecionado

          // Verificar duplicata no Supabase ANTES de salvar
          const dataRegistro = new Date(registro.data_hora_registro);
          const dataInicio = new Date(
            dataRegistro.getFullYear(),
            dataRegistro.getMonth(),
            dataRegistro.getDate()
          );
          const dataFim = new Date(dataInicio);
          dataFim.setDate(dataFim.getDate() + 1);

          // Usar supabase diretamente para verificar
          if (isSupabaseConfigured() && supabase) {
            const { data: duplicatas, error: duplicataError } = await supabase
              .from('presencas')
              .select('uuid, nome_completo, comum, cargo, data_ensaio, created_at')
              .ilike('nome_completo', nomeCompleto)
              .ilike('comum', comumBusca)
              .ilike('cargo', cargoBusca)
              .gte('data_ensaio', dataInicio.toISOString())
              .lt('data_ensaio', dataFim.toISOString());

            if (!duplicataError && duplicatas && duplicatas.length > 0) {
              const duplicata = duplicatas[0];
              console.error('🚨🚨🚨 DUPLICATA DETECTADA NO SUPABASE - BLOQUEANDO 🚨🚨🚨', {
                nome: nomeCompleto,
                comum: comumBusca,
                cargo: cargoBusca,
                uuidExistente: duplicata.uuid,
                dataExistente: duplicata.data_ensaio,
              });

              // Formatar data e horário do registro existente
              const dataExistente = new Date(duplicata.data_ensaio || duplicata.created_at);
              const dataFormatada = dataExistente.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
              const horarioFormatado = dataExistente.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });

              return {
                success: false,
                error: `DUPLICATA:${nomeCompleto}|${comumBusca}|${dataFormatada}|${horarioFormatado}`,
              };
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Erro ao verificar duplicatas no Supabase (continuando...):', error);
        // Se houver erro na verificação online, continuar com verificação local
      }
    }

    // 🛡️ VERIFICAÇÃO DE DUPLICADOS LOCAL: Verificar se já existe registro no mesmo dia
    // Baseado na lógica do backupcont/app.js
    // Pular verificação se skipDuplicateCheck = true (usuário confirmou duplicata)
    if (!skipDuplicateCheck) {
    try {
      const registrosLocais = await supabaseDataService.getRegistrosPendentesFromLocal();

      // Buscar dados da pessoa, comum e cargo para comparação
      const [comuns, cargos, pessoas] = await Promise.all([
        supabaseDataService.getComunsFromLocal(),
        supabaseDataService.getCargosFromLocal(),
        supabaseDataService.getPessoasFromLocal(
          registro.comum_id,
          registro.cargo_id,
          registro.instrumento_id || undefined
        ),
      ]);

      const comum = comuns.find(c => c.id === registro.comum_id);
      const cargo = cargos.find(c => c.id === registro.cargo_id);
      const pessoa = pessoas.find(p => p.id === registro.pessoa_id);

      if (comum && cargo && pessoa) {
        const nomeBusca = `${pessoa.nome} ${pessoa.sobrenome}`.trim().toUpperCase();
        const comumBusca = comum.nome.toUpperCase();
        const cargoBusca = cargo.nome.toUpperCase();

        // Extrair apenas a data (sem hora) para comparação
        const dataRegistro = new Date(registro.data_hora_registro);
        const dataRegistroStr = dataRegistro.toISOString().split('T')[0]; // YYYY-MM-DD

        // Verificar duplicatas nos registros locais pendentes
        for (const r of registrosLocais) {
          const rComum = comuns.find(c => c.id === r.comum_id);
          const rCargo = cargos.find(c => c.id === r.cargo_id);

          if (rComum && rCargo) {
            const rData = new Date(r.data_hora_registro);
            const rDataStr = rData.toISOString().split('T')[0];

            // Buscar pessoa do registro para comparação
            const rPessoas = await supabaseDataService.getPessoasFromLocal(
              r.comum_id,
              r.cargo_id,
              r.instrumento_id || undefined
            );
            const rPessoa = rPessoas.find(p => p.id === r.pessoa_id);

            if (rPessoa) {
              const rNome = `${rPessoa.nome} ${rPessoa.sobrenome}`.trim().toUpperCase();
              const rComumBusca = rComum.nome.toUpperCase();
              const rCargoBusca = rCargo.nome.toUpperCase();

              if (
                rNome === nomeBusca &&
                rComumBusca === comumBusca &&
                rCargoBusca === cargoBusca &&
                rDataStr === dataRegistroStr
              ) {
                console.error('🚨🚨🚨 DUPLICATA DETECTADA LOCALMENTE - BLOQUEANDO 🚨🚨🚨', {
                  nome: nomeBusca,
                  comum: comumBusca,
                  cargo: cargoBusca,
                  data: dataRegistroStr,
                  registroExistente: r.id,
                });

                // Formatar data e horário do registro existente
                const rData = new Date(r.data_hora_registro);
                const dataFormatada = rData.toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });
                const horarioFormatado = rData.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });

                return {
                  success: false,
                  error: `DUPLICATA:${nomeBusca}|${comumBusca}|${dataFormatada}|${horarioFormatado}`,
                };
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao verificar duplicatas locais (continuando...):', error);
      // Continuar mesmo com erro na verificação local
      }
    }

    // 🚨 CORREÇÃO: Sempre usar UUID v4 válido (formato: 75aef8f7-86fc-49fe-8a0c-973c9658d6e8)
    // Não usar UUID local - sempre gerar UUID válido para compatibilidade com Supabase e Google Sheets
    const uuidFinal = registro.id && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registro.id)
      ? registro.id
      : uuidv4();

    if (isOnline) {
      try {
        // 🚀 FLUXO OTIMIZADO: Google Sheets PRIMEIRO (como backupcont)
        // 1. Enviar para Google Sheets PRIMEIRO (mais rápido e confiável)
        console.log('📤 Enviando para Google Sheets primeiro...');
        const sheetsResult = await googleSheetsService.sendRegistroToSheet({
          ...registro,
          id: uuidFinal,
        });

        if (sheetsResult.success) {
          console.log('✅ Registro enviado para Google Sheets com sucesso');
          
          // 🚨 CORREÇÃO CRÍTICA: Enviar para Supabase APÓS confirmação do Google Sheets
          // Não usar setTimeout - enviar imediatamente após confirmação
          try {
            console.log('📤 Enviando para Supabase após confirmação do Google Sheets...');
            // O método createRegistroPresenca já trata UUID local automaticamente
            const createdRegistro = await supabaseDataService.createRegistroPresenca(
              {
                ...registro,
                id: uuidFinal, // Pode ser local, será convertido para válido dentro do método
              },
              skipDuplicateCheck
            );
            if (createdRegistro) {
              console.log('✅✅✅ Registro também enviado para Supabase com sucesso ✅✅✅');
            } else {
              console.error('❌❌❌ Registro NÃO foi criado no Supabase (mas Google Sheets OK) ❌❌❌');
              // 🚨 CRÍTICO: Não silenciar erro - logar como erro crítico
            }
          } catch (supabaseError) {
            // 🚨 CRÍTICO: Logar erro detalhado ao invés de apenas warning
            console.error('❌❌❌ ERRO CRÍTICO ao enviar para Supabase ❌❌❌', {
              error: supabaseError,
              message: supabaseError instanceof Error ? supabaseError.message : String(supabaseError),
              stack: supabaseError instanceof Error ? supabaseError.stack : undefined,
              registro: {
                id: uuidFinal,
                pessoa_id: registro.pessoa_id,
                comum_id: registro.comum_id,
                cargo_id: registro.cargo_id,
              },
            });
            // Continuar mesmo com erro no Supabase - Google Sheets já salvou
            // Mas logar como erro crítico para debug
          }

          // Sucesso - retornar após tentar Supabase
          const tempoTotal = performance.now() - inicioTempo;
          console.log(`⏱️ Registro processado em ${tempoTotal.toFixed(2)}ms`);
          return { success: true };
        } else {
          // Google Sheets falhou - verificar se é erro de conectividade
          const isNetworkError = 
            sheetsResult.error?.includes('Failed to fetch') ||
            sheetsResult.error?.includes('Timeout') ||
            sheetsResult.error?.includes('Network') ||
            sheetsResult.error?.includes('AbortError');

          if (isNetworkError) {
            // Erro de conectividade - salvar na fila
            console.warn('⚠️ Erro de conectividade ao enviar para Google Sheets, salvando na fila:', sheetsResult.error);
            await supabaseDataService.saveRegistroToLocal({
              ...registro,
              id: uuidFinal,
              status_sincronizacao: 'pending',
            });
            const tempoTotal = performance.now() - inicioTempo;
            console.log(`⏱️ Registro salvo localmente em ${tempoTotal.toFixed(2)}ms (sem conexão)`);
            return {
              success: true,
              error: 'Registro salvo localmente. Será enviado quando a conexão voltar.',
            };
          } else {
            // Outro erro do Google Sheets - tentar Supabase como fallback
            console.warn('⚠️ Erro ao enviar para Google Sheets, tentando Supabase como fallback:', sheetsResult.error);
            try {
              // O método createRegistroPresenca já trata UUID local automaticamente
              const createdRegistro = await supabaseDataService.createRegistroPresenca(
                {
                  ...registro,
                  id: uuidFinal, // Pode ser local, será convertido para válido dentro do método
                },
                skipDuplicateCheck
              );
              if (createdRegistro) {
                const tempoTotal = performance.now() - inicioTempo;
                console.log(`✅ Registro enviado para Supabase (fallback) em ${tempoTotal.toFixed(2)}ms`);
                return { success: true };
              }
            } catch (supabaseError) {
              // Verificar se é erro de duplicata
              if (
                supabaseError instanceof Error &&
                (supabaseError.message.includes('DUPLICATA') ||
                  supabaseError.message.includes('duplicat') ||
                  supabaseError.message.includes('já foi cadastrado') ||
                  supabaseError.message.includes('DUPLICATA_BLOQUEADA'))
              ) {
                console.error('🚨 Duplicata detectada no Supabase:', supabaseError.message);
                return {
                  success: false,
                  error: supabaseError.message.includes('DUPLICATA_BLOQUEADA')
                    ? supabaseError.message.replace('DUPLICATA_BLOQUEADA: ', '')
                    : supabaseError.message,
                };
              }
              // Ambos falharam - salvar na fila
              console.error('❌ Ambos Google Sheets e Supabase falharam, salvando na fila:', supabaseError);
              await supabaseDataService.saveRegistroToLocal({
                ...registro,
                id: uuidFinal,
                status_sincronizacao: 'pending',
              });
              return {
                success: true,
                error: 'Registro salvo localmente. Será sincronizado automaticamente quando possível.',
              };
            }
          }
        }
      } catch (error) {
        // Verificar se é erro de duplicata
        if (error instanceof Error && error.message.includes('DUPLICATA_BLOQUEADA')) {
          return {
            success: false,
            error: error.message.replace('DUPLICATA_BLOQUEADA: ', ''),
          };
        }

        // Verificar se é erro de conectividade
        const isNetworkError = 
          error instanceof Error &&
          (error.message.includes('Failed to fetch') ||
            error.message.includes('Timeout') ||
            error.message.includes('Network') ||
            error.message.includes('AbortError'));

        if (isNetworkError) {
          // Erro de conectividade - salvar na fila
          console.warn('⚠️ Erro de conectividade, salvando na fila:', error);
          await supabaseDataService.saveRegistroToLocal({
            ...registro,
            id: uuidFinal,
            status_sincronizacao: 'pending',
          });
          return {
            success: true,
            error: 'Registro salvo localmente. Será enviado quando a conexão voltar.',
          };
        }

        // Outro erro - salvar na fila
        console.error('❌ Erro ao processar registro, salvando na fila:', error);
        await supabaseDataService.saveRegistroToLocal({
          ...registro,
          id: uuidFinal,
          status_sincronizacao: 'pending',
        });
        return {
          success: true,
          error: 'Registro salvo localmente. Será sincronizado automaticamente quando possível.',
        };
      }
    } else {
      // Offline: salvar localmente como pending
      try {
        console.log('📱 Modo offline detectado, salvando registro localmente...');
        await supabaseDataService.saveRegistroToLocal({
          ...registro,
          id: uuidFinal,
          status_sincronizacao: 'pending',
        });
        console.log('✅ Registro salvo localmente com sucesso (ID:', uuidFinal, ')');
        return {
          success: true,
          error: 'Registro salvo localmente. Será sincronizado quando a conexão voltar.',
        };
      } catch (error) {
        console.error('❌ ERRO CRÍTICO ao salvar registro localmente quando offline:', error);
        // Mesmo com erro, tentar retornar sucesso para não bloquear o usuário
        // O erro será logado para debug
        return {
          success: false,
          error: `Erro ao salvar registro localmente: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  },
};
