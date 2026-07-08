export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assinaturas_config: {
        Row: {
          ativo: boolean
          cargo: string
          codigo_sei: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_processo"]
          id: string
          nome_servidor: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo: string
          codigo_sei?: string | null
          created_at?: string
          etapa: Database["public"]["Enums"]["etapa_processo"]
          id?: string
          nome_servidor: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo?: string
          codigo_sei?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_processo"]
          id?: string
          nome_servidor?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      assinaturas_etapa: {
        Row: {
          assinado_em: string
          assinado_por: string | null
          bloco: string
          cargo: string | null
          created_at: string
          id: string
          lancamento_id: string
          servidor_nome: string | null
          slot: string
        }
        Insert: {
          assinado_em?: string
          assinado_por?: string | null
          bloco: string
          cargo?: string | null
          created_at?: string
          id?: string
          lancamento_id: string
          servidor_nome?: string | null
          slot: string
        }
        Update: {
          assinado_em?: string
          assinado_por?: string | null
          bloco?: string
          cargo?: string | null
          created_at?: string
          id?: string
          lancamento_id?: string
          servidor_nome?: string | null
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_etapa_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_lancamento: {
        Row: {
          assinado: boolean
          assinado_em: string | null
          assinado_por: string | null
          cargo: string
          codigo_sei: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_processo"]
          id: string
          lancamento_id: string
          nome_servidor: string
          ordem: number
        }
        Insert: {
          assinado?: boolean
          assinado_em?: string | null
          assinado_por?: string | null
          cargo: string
          codigo_sei?: string | null
          created_at?: string
          etapa: Database["public"]["Enums"]["etapa_processo"]
          id?: string
          lancamento_id: string
          nome_servidor: string
          ordem?: number
        }
        Update: {
          assinado?: boolean
          assinado_em?: string | null
          assinado_por?: string | null
          cargo?: string
          codigo_sei?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_processo"]
          id?: string
          lancamento_id?: string
          nome_servidor?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_lancamento_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      convenios: {
        Row: {
          created_at: string
          data_inicio_vigencia: string | null
          dia_fim_execucao: number | null
          dia_inicio_execucao: number | null
          exige_prestacao_contas: boolean
          exige_relatorio_analise: boolean
          id: string
          link_processo_sei: string | null
          modelo_fluxo: string
          numero_processo_sei_mae: string | null
          objeto: string | null
          pagamento_pontual: boolean
          prazo_prestacao_contas_dias: number | null
          prazo_retorno_cgm_dias: number | null
          prazo_retorno_entidade_dias: number | null
          prestador_id: string
          status_convenio: Database["public"]["Enums"]["status_convenio"]
          teto_mensal: number | null
          total_parcelas: number | null
          updated_at: string
          valor_total: number | null
        }
        Insert: {
          created_at?: string
          data_inicio_vigencia?: string | null
          dia_fim_execucao?: number | null
          dia_inicio_execucao?: number | null
          exige_prestacao_contas?: boolean
          exige_relatorio_analise?: boolean
          id?: string
          link_processo_sei?: string | null
          modelo_fluxo?: string
          numero_processo_sei_mae?: string | null
          objeto?: string | null
          pagamento_pontual?: boolean
          prazo_prestacao_contas_dias?: number | null
          prazo_retorno_cgm_dias?: number | null
          prazo_retorno_entidade_dias?: number | null
          prestador_id: string
          status_convenio?: Database["public"]["Enums"]["status_convenio"]
          teto_mensal?: number | null
          total_parcelas?: number | null
          updated_at?: string
          valor_total?: number | null
        }
        Update: {
          created_at?: string
          data_inicio_vigencia?: string | null
          dia_fim_execucao?: number | null
          dia_inicio_execucao?: number | null
          exige_prestacao_contas?: boolean
          exige_relatorio_analise?: boolean
          id?: string
          link_processo_sei?: string | null
          modelo_fluxo?: string
          numero_processo_sei_mae?: string | null
          objeto?: string | null
          pagamento_pontual?: boolean
          prazo_prestacao_contas_dias?: number | null
          prazo_retorno_cgm_dias?: number | null
          prazo_retorno_entidade_dias?: number | null
          prestador_id?: string
          status_convenio?: Database["public"]["Enums"]["status_convenio"]
          teto_mensal?: number | null
          total_parcelas?: number | null
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "convenios_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_logs: {
        Row: {
          acao: string
          convenio_id: string | null
          data_hora: string
          detalhes: Json | null
          id: string
          lancamento_id: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          convenio_id?: string | null
          data_hora?: string
          detalhes?: Json | null
          id?: string
          lancamento_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          convenio_id?: string | null
          data_hora?: string
          detalhes?: Json | null
          id?: string
          lancamento_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_logs_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_logs_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_pagamento: {
        Row: {
          certidoes_ok: boolean
          competencia: string | null
          concluido: boolean
          convenio_id: string | null
          created_at: string
          created_by: string | null
          data_limite: string | null
          data_pagamento: string | null
          descricao: string | null
          dotacao_orcamentaria: string | null
          em_bloco_revisao: boolean
          etapa_atual: Database["public"]["Enums"]["etapa_processo"]
          fonte_pagamento: string | null
          id: string
          justificativa_teto: string | null
          link_anulacao_sei: string | null
          link_certidoes_sei: string | null
          aviso_enc_sefaz: boolean
          link_aviso_liquidacao_sei: string | null
          link_memorando_sei: string | null
          link_minuta_sei: string | null
          link_portaria_sei: string | null
          link_solicitacao_liquidacao_sei: string | null
          minuta_enc_ses: boolean
          valor_liquidado: number | null
          link_comprovante_pagamento_sei: string | null
          link_empenho_sei: string | null
          link_programacao_pagamento_sei: string | null
          link_relatorio_analise_sei: string | null
          link_relatorio_tecnico_sei: string | null
          link_solicitacao_anulacao: string | null
          link_solicitacao_liberacao_sei: string | null
          link_solicitacao_sei: string | null
          link_subempenho_sei: string | null
          mes_pagamento_previsto: string | null
          numero_empenho: string | null
          parcela: string | null
          parcelas_competencia: Json | null
          parent_id: string | null
          prestador_id: string | null
          reaberto: boolean
          relatorio_analise_ok: boolean
          relatorio_tecnico_ok: boolean
          responsavel_atual: string
          revisao_aprovada: boolean | null
          revisao_obs: string | null
          revisao_status: string
          sefaz_etapa1_em: string | null
          sefaz_etapa4_em: string | null
          sefaz_etapa5_em: string | null
          status_aco: Database["public"]["Enums"]["status_aco"]
          termo_aditivo: string | null
          termo_aditivo_id: string | null
          updated_at: string
          valor_anulado: number | null
          valor_atestado: number | null
          valor_empenho_liquido: number | null
          valor_solicitado: number | null
        }
        Insert: {
          certidoes_ok?: boolean
          competencia?: string | null
          concluido?: boolean
          convenio_id?: string | null
          created_at?: string
          created_by?: string | null
          data_limite?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          dotacao_orcamentaria?: string | null
          em_bloco_revisao?: boolean
          etapa_atual?: Database["public"]["Enums"]["etapa_processo"]
          fonte_pagamento?: string | null
          id?: string
          justificativa_teto?: string | null
          link_anulacao_sei?: string | null
          link_certidoes_sei?: string | null
          aviso_enc_sefaz?: boolean
          link_aviso_liquidacao_sei?: string | null
          link_memorando_sei?: string | null
          link_minuta_sei?: string | null
          link_portaria_sei?: string | null
          link_solicitacao_liquidacao_sei?: string | null
          minuta_enc_ses?: boolean
          valor_liquidado?: number | null
          link_comprovante_pagamento_sei?: string | null
          link_empenho_sei?: string | null
          link_programacao_pagamento_sei?: string | null
          link_relatorio_analise_sei?: string | null
          link_relatorio_tecnico_sei?: string | null
          link_solicitacao_anulacao?: string | null
          link_solicitacao_liberacao_sei?: string | null
          link_solicitacao_sei?: string | null
          link_subempenho_sei?: string | null
          mes_pagamento_previsto?: string | null
          numero_empenho?: string | null
          parcela?: string | null
          parcelas_competencia?: Json | null
          parent_id?: string | null
          prestador_id?: string | null
          reaberto?: boolean
          relatorio_analise_ok?: boolean
          relatorio_tecnico_ok?: boolean
          responsavel_atual?: string
          revisao_aprovada?: boolean | null
          revisao_obs?: string | null
          revisao_status?: string
          sefaz_etapa1_em?: string | null
          sefaz_etapa4_em?: string | null
          sefaz_etapa5_em?: string | null
          status_aco?: Database["public"]["Enums"]["status_aco"]
          termo_aditivo?: string | null
          termo_aditivo_id?: string | null
          updated_at?: string
          valor_anulado?: number | null
          valor_atestado?: number | null
          valor_empenho_liquido?: number | null
          valor_solicitado?: number | null
        }
        Update: {
          certidoes_ok?: boolean
          competencia?: string | null
          concluido?: boolean
          convenio_id?: string | null
          created_at?: string
          created_by?: string | null
          data_limite?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          dotacao_orcamentaria?: string | null
          em_bloco_revisao?: boolean
          etapa_atual?: Database["public"]["Enums"]["etapa_processo"]
          fonte_pagamento?: string | null
          id?: string
          justificativa_teto?: string | null
          link_anulacao_sei?: string | null
          link_certidoes_sei?: string | null
          aviso_enc_sefaz?: boolean
          link_aviso_liquidacao_sei?: string | null
          link_memorando_sei?: string | null
          link_minuta_sei?: string | null
          link_portaria_sei?: string | null
          link_solicitacao_liquidacao_sei?: string | null
          minuta_enc_ses?: boolean
          valor_liquidado?: number | null
          link_comprovante_pagamento_sei?: string | null
          link_empenho_sei?: string | null
          link_programacao_pagamento_sei?: string | null
          link_relatorio_analise_sei?: string | null
          link_relatorio_tecnico_sei?: string | null
          link_solicitacao_anulacao?: string | null
          link_solicitacao_liberacao_sei?: string | null
          link_solicitacao_sei?: string | null
          link_subempenho_sei?: string | null
          mes_pagamento_previsto?: string | null
          numero_empenho?: string | null
          parcela?: string | null
          parcelas_competencia?: Json | null
          parent_id?: string | null
          prestador_id?: string | null
          reaberto?: boolean
          relatorio_analise_ok?: boolean
          relatorio_tecnico_ok?: boolean
          responsavel_atual?: string
          revisao_aprovada?: boolean | null
          revisao_obs?: string | null
          revisao_status?: string
          sefaz_etapa1_em?: string | null
          sefaz_etapa4_em?: string | null
          sefaz_etapa5_em?: string | null
          status_aco?: Database["public"]["Enums"]["status_aco"]
          termo_aditivo?: string | null
          termo_aditivo_id?: string | null
          updated_at?: string
          valor_anulado?: number | null
          valor_atestado?: number | null
          valor_empenho_liquido?: number | null
          valor_solicitado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_pagamento_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_pagamento_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_pagamento_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_pagamento_termo_aditivo_id_fkey"
            columns: ["termo_aditivo_id"]
            isOneToOne: false
            referencedRelation: "termos_aditivos"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_acesso: {
        Row: {
          acao: string
          created_at: string
          detalhe: string | null
          id: string
          rota: string | null
          user_agent: string | null
          user_id: string | null
          usuario_email: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhe?: string | null
          id?: string
          rota?: string | null
          user_agent?: string | null
          user_id?: string | null
          usuario_email?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhe?: string | null
          id?: string
          rota?: string | null
          user_agent?: string | null
          user_id?: string | null
          usuario_email?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      notas_comentarios: {
        Row: {
          data_hora: string
          id: string
          lancamento_id: string
          mensagem: string
          setor: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          data_hora?: string
          id?: string
          lancamento_id: string
          mensagem: string
          setor?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          data_hora?: string
          id?: string
          lancamento_id?: string
          mensagem?: string
          setor?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_comentarios_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          id: string
          lancamento_id: string | null
          lida: boolean
          mensagem: string | null
          tipo: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lancamento_id?: string | null
          lida?: boolean
          mensagem?: string | null
          tipo?: string | null
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lancamento_id?: string | null
          lida?: boolean
          mensagem?: string | null
          tipo?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_log: {
        Row: {
          assunto: string | null
          data_envio: string
          destinatario: string | null
          id: string
          lancamento_id: string | null
          mensagem: string | null
          tipo: string
        }
        Insert: {
          assunto?: string | null
          data_envio?: string
          destinatario?: string | null
          id?: string
          lancamento_id?: string | null
          mensagem?: string | null
          tipo: string
        }
        Update: {
          assunto?: string | null
          data_envio?: string
          destinatario?: string | null
          id?: string
          lancamento_id?: string | null
          mensagem?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_log_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      prestacao_prazo_avisos: {
        Row: {
          created_at: string
          id: string
          lancamento_id: string
          marco: string
        }
        Insert: {
          created_at?: string
          id?: string
          lancamento_id: string
          marco: string
        }
        Update: {
          created_at?: string
          id?: string
          lancamento_id?: string
          marco?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestacao_prazo_avisos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      prestacoes_contas: {
        Row: {
          created_at: string
          data_baixa_contabil: string | null
          data_enc_cgm: string | null
          data_envio_entidade: string | null
          data_parecer_ses: string | null
          data_recebimento: string | null
          data_retorno_cgm: string | null
          data_retorno_entidade: string | null
          decidido_em: string | null
          decidido_por: string | null
          exercicio_baixa: number | null
          id: string
          lancamento_id: string
          link_manifestacao_cgm_sei: string | null
          link_parecer_ses_sei: string | null
          link_prestacao_sei: string | null
          link_relatorio_analise_sei: string | null
          numero_processo_pc: string | null
          observacao: string | null
          parecer: string | null
          redistribuir: boolean
          responsavel_id: string | null
          situacao_baixa: string | null
          status: string
          status_cgm: string | null
          updated_at: string
          valor_aprovado: number | null
          valor_glosado: number | null
        }
        Insert: {
          created_at?: string
          data_baixa_contabil?: string | null
          data_enc_cgm?: string | null
          data_envio_entidade?: string | null
          data_parecer_ses?: string | null
          data_recebimento?: string | null
          data_retorno_cgm?: string | null
          data_retorno_entidade?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          exercicio_baixa?: number | null
          id?: string
          lancamento_id: string
          link_manifestacao_cgm_sei?: string | null
          link_parecer_ses_sei?: string | null
          link_prestacao_sei?: string | null
          link_relatorio_analise_sei?: string | null
          numero_processo_pc?: string | null
          observacao?: string | null
          parecer?: string | null
          redistribuir?: boolean
          responsavel_id?: string | null
          situacao_baixa?: string | null
          status?: string
          status_cgm?: string | null
          updated_at?: string
          valor_aprovado?: number | null
          valor_glosado?: number | null
        }
        Update: {
          created_at?: string
          data_baixa_contabil?: string | null
          data_enc_cgm?: string | null
          data_envio_entidade?: string | null
          data_parecer_ses?: string | null
          data_recebimento?: string | null
          data_retorno_cgm?: string | null
          data_retorno_entidade?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          exercicio_baixa?: number | null
          id?: string
          lancamento_id?: string
          link_manifestacao_cgm_sei?: string | null
          link_parecer_ses_sei?: string | null
          link_prestacao_sei?: string | null
          link_relatorio_analise_sei?: string | null
          numero_processo_pc?: string | null
          observacao?: string | null
          parecer?: string | null
          redistribuir?: boolean
          responsavel_id?: string | null
          situacao_baixa?: string | null
          status?: string
          status_cgm?: string | null
          updated_at?: string
          valor_aprovado?: number | null
          valor_glosado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prestacoes_contas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestacoes_contas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prestacoes_contas_interacoes: {
        Row: {
          autor_nome: string | null
          created_at: string
          descricao: string | null
          id: string
          link_sei: string | null
          prestacao_id: string
          tipo: string
        }
        Insert: {
          autor_nome?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          link_sei?: string | null
          prestacao_id: string
          tipo: string
        }
        Update: {
          autor_nome?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          link_sei?: string | null
          prestacao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestacoes_contas_interacoes_prestacao_id_fkey"
            columns: ["prestacao_id"]
            isOneToOne: false
            referencedRelation: "prestacoes_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      prestadores: {
        Row: {
          cnpj: string | null
          created_at: string
          data_cadastro: string
          id: string
          nome_instituicao: string
          status: Database["public"]["Enums"]["status_prestador"]
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          data_cadastro?: string
          id?: string
          nome_instituicao: string
          status?: Database["public"]["Enums"]["status_prestador"]
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          data_cadastro?: string
          id?: string
          nome_instituicao?: string
          status?: Database["public"]["Enums"]["status_prestador"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          created_at: string
          email: string
          id: string
          nome: string
          setor: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          email: string
          id: string
          nome: string
          setor?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          setor?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      revisoes_empenho: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          created_at: string
          decisao: string
          id: string
          justificativa: string | null
          lancamento_id: string
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          decisao: string
          id?: string
          justificativa?: string | null
          lancamento_id: string
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          decisao?: string
          id?: string
          justificativa?: string | null
          lancamento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisoes_empenho_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      sistema_config: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      sla_config: {
        Row: {
          created_at: string
          data_limite_mensal: number | null
          descricao: string | null
          dias_uteis_prazo: number | null
          id: string
          parametro_nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_limite_mensal?: number | null
          descricao?: string | null
          dias_uteis_prazo?: number | null
          id?: string
          parametro_nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_limite_mensal?: number | null
          descricao?: string | null
          dias_uteis_prazo?: number | null
          id?: string
          parametro_nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      termos_aditivos: {
        Row: {
          convenio_id: string
          created_at: string
          data_assinatura: string | null
          id: string
          identificador: string
          link_extrato_sei: string | null
          link_termo_sei: string | null
          numero_sei: string | null
          objeto: string | null
          updated_at: string
          valor_total: number | null
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          convenio_id: string
          created_at?: string
          data_assinatura?: string | null
          id?: string
          identificador: string
          link_extrato_sei?: string | null
          link_termo_sei?: string | null
          numero_sei?: string | null
          objeto?: string | null
          updated_at?: string
          valor_total?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          convenio_id?: string
          created_at?: string
          data_assinatura?: string | null
          id?: string
          identificador?: string
          link_extrato_sei?: string | null
          link_termo_sei?: string | null
          numero_sei?: string | null
          objeto?: string | null
          updated_at?: string
          valor_total?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termos_aditivos_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_retencao_logs: {
        Args: never
        Returns: {
          logs_removidos: number
          notificacoes_removidas: number
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notificar_prestacao: {
        Args: {
          p_lancamento: string
          p_msg: string
          p_responsavel: string
          p_titulo: string
        }
        Returns: undefined
      }
      verificar_prazos_prestacao: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "acp" | "aco"
      etapa_processo:
        | "solicitacao_empenho"
        | "nota_empenho"
        | "solicitacao_anulacao"
        | "anulacao_executada"
      status_aco:
        | "aguardando_indicacao"
        | "aguardando_descontingenciamento"
        | "orcamento_disponivel"
        | "empenhado"
      status_convenio: "ativo" | "suspenso" | "encerrado"
      status_prestador: "ativo" | "inativo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "acp", "aco"],
      etapa_processo: [
        "solicitacao_empenho",
        "nota_empenho",
        "solicitacao_anulacao",
        "anulacao_executada",
      ],
      status_aco: [
        "aguardando_indicacao",
        "aguardando_descontingenciamento",
        "orcamento_disponivel",
        "empenhado",
      ],
      status_convenio: ["ativo", "suspenso", "encerrado"],
      status_prestador: ["ativo", "inativo"],
    },
  },
} as const
