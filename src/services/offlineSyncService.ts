import NetInfo from '@react-native-community/netinfo';
import { supabaseDataService } from './supabaseDataService';
import { googleSheetsService } from './googleSheetsService';
import { RegistroPresenca } from '../types/models';
import { authService } from './authService';

export const offlineSyncService = {
  async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable === true;
  },

  async syncAllData(): Promise<{ success: boolean; error?: string }> {
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
      try {
        await this.syncPendingRegistros();
      } catch (error) {
        console.warn(
          '⚠️ Erro ao sincronizar registros pendentes (continuando...):',
          error instanceof Error ? error.message : error
        );
      }

      return { success: true };
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

  async syncPendingRegistros(): Promise<void> {
    const registros = await supabaseDataService.getRegistrosPendentesFromLocal();

    console.log(`🔄 Sincronizando ${registros.length} registros pendentes...`);

    for (const registro of registros) {
      try {
        // ORDEM CORRETA: Google Sheets primeiro, depois Supabase
        let sheetsSuccess = false;

        // 1. Tentar enviar para Google Sheets primeiro
        try {
          const sheetsResult = await googleSheetsService.sendRegistroToSheet(registro);
          if (sheetsResult.success) {
            sheetsSuccess = true;
            console.log(`✅ Registro ${registro.id} enviado para Google Sheets`);
          } else {
            console.warn(
              `⚠️ Falha ao enviar ${registro.id} para Google Sheets:`,
              sheetsResult.error
            );
          }
        } catch (sheetsError) {
          console.warn(`⚠️ Erro ao enviar ${registro.id} para Google Sheets:`, sheetsError);
        }

        // 2. Tentar enviar para Supabase
        try {
          const createdRegistro = await supabaseDataService.createRegistroPresenca(registro);

          // Se ambos foram bem-sucedidos, marcar como sincronizado
          if (registro.id) {
            await supabaseDataService.updateRegistroStatus(registro.id, 'synced');
            console.log(
              `✅ Registro ${registro.id} sincronizado com sucesso (Google Sheets: ${sheetsSuccess ? 'OK' : 'Falhou'}, Supabase: OK)`
            );
          }
        } catch (supabaseError) {
          console.error(`❌ Erro ao enviar ${registro.id} para Supabase:`, supabaseError);
          // Se Google Sheets foi bem-sucedido mas Supabase falhou, manter como pending
          if (sheetsSuccess) {
            console.warn(
              `⚠️ Registro ${registro.id} enviado para Google Sheets mas falhou no Supabase - mantendo como pending`
            );
          }
        }
      } catch (error) {
        // Se falhou completamente, manter como pending para tentar novamente depois
        console.error(`❌ Erro ao sincronizar registro ${registro.id}:`, error);
      }
    }

    console.log(`✅ Sincronização de registros concluída`);
  },

  async createRegistro(registro: RegistroPresenca): Promise<{ success: boolean; error?: string }> {
    const isOnline = await this.isOnline();

    // 🛡️ VERIFICAÇÃO DE DUPLICADOS NO SUPABASE PRIMEIRO (se online)
    // Deve verificar ANTES de salvar em qualquer lugar
    if (isOnline) {
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
          const { supabase, isSupabaseConfigured } = await import('./supabaseClient');
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

    // Sempre salvar localmente primeiro (para garantir que não perdemos o registro)
    const localId = registro.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await supabaseDataService.saveRegistroToLocal({
      ...registro,
      id: localId,
      status_sincronizacao: 'pending',
    });

    if (isOnline) {
      try {
        // Verificar se a sessão é válida
        const sessionValid = await authService.isSessionValid();
        if (!sessionValid) {
          console.warn(
            '⚠️ Sessão inválida, registro salvo localmente para sincronização posterior'
          );
          return {
            success: true,
            error: 'Registro salvo localmente. Será sincronizado quando a sessão for renovada.',
          };
        }

        // ORDEM CORRETA: Google Sheets primeiro, depois Supabase
        let sheetsSuccess = false;

        // 1. Tentar enviar para Google Sheets primeiro
        try {
          const sheetsResult = await googleSheetsService.sendRegistroToSheet({
            ...registro,
            id: localId,
          });
          if (sheetsResult.success) {
            sheetsSuccess = true;
            console.log('✅ Registro enviado para Google Sheets com sucesso');
          } else {
            console.warn('⚠️ Falha ao enviar para Google Sheets:', sheetsResult.error);
          }
        } catch (sheetsError) {
          console.warn('⚠️ Erro ao enviar para Google Sheets:', sheetsError);
        }

        // 2. Tentar enviar para Supabase (já tem verificação de duplicados interna)
        console.log('📤 Tentando enviar registro para Supabase...');
        try {
          const createdRegistro = await supabaseDataService.createRegistroPresenca({
            ...registro,
            id: localId,
          });

          // Se Supabase foi bem-sucedido, atualizar status local para sincronizado
          if (createdRegistro) {
            await supabaseDataService.updateRegistroStatus(localId, 'synced');
            console.log(
              `✅ Registro sincronizado com sucesso (Google Sheets: ${sheetsSuccess ? 'OK' : 'Falhou'}, Supabase: OK)`
            );
            return { success: true };
          } else {
            throw new Error('createRegistroPresenca retornou null/undefined');
          }
        } catch (supabaseError) {
          // Verificar se é erro de duplicata
          if (
            supabaseError instanceof Error &&
            supabaseError.message.includes('DUPLICATA_BLOQUEADA')
          ) {
            console.error('🚨 Duplicata detectada no Supabase:', supabaseError.message);
            // Remover registro local duplicado
            try {
              await supabaseDataService.deleteRegistroFromLocal(localId);
            } catch (deleteError) {
              console.warn('⚠️ Erro ao remover registro duplicado local:', deleteError);
            }
            return {
              success: false,
              error: supabaseError.message.replace('DUPLICATA_BLOQUEADA: ', ''),
            };
          }

          console.error('❌ Erro ao enviar para Supabase:', supabaseError);
          // Se Google Sheets foi bem-sucedido mas Supabase falhou, manter como pending
          if (sheetsSuccess) {
            console.warn(
              '⚠️ Registro enviado para Google Sheets mas falhou no Supabase - mantendo como pending'
            );
          }
          throw supabaseError; // Re-throw para ser capturado pelo catch externo
        }
      } catch (error) {
        // Verificar se é erro de duplicata
        if (error instanceof Error && error.message.includes('DUPLICATA_BLOQUEADA')) {
          return {
            success: false,
            error: error.message.replace('DUPLICATA_BLOQUEADA: ', ''),
          };
        }

        console.error('❌ Erro ao enviar para Supabase, registro permanece como pending:', error);
        // Registro já está salvo localmente como pending, será sincronizado depois
        return {
          success: true,
          error: 'Registro salvo localmente. Será sincronizado automaticamente quando possível.',
        };
      }
    } else {
      // Offline: registro já foi salvo localmente como pending
      console.log('📱 Modo offline, registro salvo localmente');
      return {
        success: true,
        error: 'Registro salvo localmente. Será sincronizado quando a conexão voltar.',
      };
    }
  },
};
