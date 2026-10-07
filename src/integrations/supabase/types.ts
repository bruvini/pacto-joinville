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
      assinaturas_manual_override: {
        Row: {
          nome_novo: string | null
          nome_original: string
          oculto: boolean
          updated_at: string
        }
        Insert: {
          nome_novo?: string | null
          nome_original: string
          oculto?: boolean
          updated_at?: string
        }
        Update: {
          nome_novo?: string | null
          nome_original?: string
          oculto?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cacon_arquivos: {
        Row: {
          categoria: string
          competencia_id: string
          enviado_em: string
          enviado_por: string | null
          enviado_por_nome: string | null
          id: string
          mime_type: string | null
          nome_original: string
          sha256: string
          storage_path: string
          tamanho: number | null
        }
        Insert: {
          categoria?: string
          competencia_id: string
          enviado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime_type?: string | null
          nome_original: string
          sha256: string
          storage_path: string
          tamanho?: number | null
        }
        Update: {
          categoria?: string
          competencia_id?: string
          enviado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime_type?: string | null
          nome_original?: string
          sha256?: string
          storage_path?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cacon_arquivos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "cacon_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      cacon_assinaturas: {
        Row: {
          assinado_em: string
          assinado_por: string | null
          cargo: string
          competencia_id: string
          id: string
          servidor_nome: string
          slot: string
        }
        Insert: {
          assinado_em?: string
          assinado_por?: string | null
          cargo?: string
          competencia_id: string
          id?: string
          servidor_nome: string
          slot?: string
        }
        Update: {
          assinado_em?: string
          assinado_por?: string | null
          cargo?: string
          competencia_id?: string
          id?: string
          servidor_nome?: string
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "cacon_assinaturas_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "cacon_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      cacon_competencias: {
        Row: {
          auditoria: Json
          competencia: string
          created_at: string
          created_by: string | null
          data_recebimento: string | null
          dias_enteral: number | null
          dias_oral: number | null
          encaminhado_por: string | null
          encaminhado_por_nome: string | null
          encaminhado_ses_ufi_em: string | null
          extracao: Json
          hmsj_anexo_link: string | null
          hmsj_anexo_numero: string | null
          hmsj_memorando_link: string | null
          hmsj_memorando_numero: string | null
          id: string
          pacientes_enteral: number | null
          pacientes_oral: number | null
          portaria_referencia: string
          portaria_sei_link: string | null
          portaria_sei_numero: string
          prestador_id: string
          processado_em: string | null
          relatorio_gerado_em: string | null
          sms_memorando_data: string | null
          sms_memorando_link: string | null
          sms_memorando_numero: string | null
          status: string
          total_unidades: number | null
          updated_at: string
          updated_by: string | null
          valor_fornecido: number | null
          valor_medio_dia: number | null
          valor_medio_unitario: number | null
        }
        Insert: {
          auditoria?: Json
          competencia: string
          created_at?: string
          created_by?: string | null
          data_recebimento?: string | null
          dias_enteral?: number | null
          dias_oral?: number | null
          encaminhado_por?: string | null
          encaminhado_por_nome?: string | null
          encaminhado_ses_ufi_em?: string | null
          extracao?: Json
          hmsj_anexo_link?: string | null
          hmsj_anexo_numero?: string | null
          hmsj_memorando_link?: string | null
          hmsj_memorando_numero?: string | null
          id?: string
          pacientes_enteral?: number | null
          pacientes_oral?: number | null
          portaria_referencia?: string
          portaria_sei_link?: string | null
          portaria_sei_numero?: string
          prestador_id: string
          processado_em?: string | null
          relatorio_gerado_em?: string | null
          sms_memorando_data?: string | null
          sms_memorando_link?: string | null
          sms_memorando_numero?: string | null
          status?: string
          total_unidades?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_fornecido?: number | null
          valor_medio_dia?: number | null
          valor_medio_unitario?: number | null
        }
        Update: {
          auditoria?: Json
          competencia?: string
          created_at?: string
          created_by?: string | null
          data_recebimento?: string | null
          dias_enteral?: number | null
          dias_oral?: number | null
          encaminhado_por?: string | null
          encaminhado_por_nome?: string | null
          encaminhado_ses_ufi_em?: string | null
          extracao?: Json
          hmsj_anexo_link?: string | null
          hmsj_anexo_numero?: string | null
          hmsj_memorando_link?: string | null
          hmsj_memorando_numero?: string | null
          id?: string
          pacientes_enteral?: number | null
          pacientes_oral?: number | null
          portaria_referencia?: string
          portaria_sei_link?: string | null
          portaria_sei_numero?: string
          prestador_id?: string
          processado_em?: string | null
          relatorio_gerado_em?: string | null
          sms_memorando_data?: string | null
          sms_memorando_link?: string | null
          sms_memorando_numero?: string | null
          status?: string
          total_unidades?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_fornecido?: number | null
          valor_medio_dia?: number | null
          valor_medio_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cacon_competencias_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      cacon_logs: {
        Row: {
          acao: string
          competencia_id: string
          detalhes: Json
          id: string
          ocorrido_em: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          competencia_id: string
          detalhes?: Json
          id?: string
          ocorrido_em?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          competencia_id?: string
          detalhes?: Json
          id?: string
          ocorrido_em?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cacon_logs_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "cacon_competencias"
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
          prazo_atesto_meses: number
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
          prazo_atesto_meses?: number
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
          prazo_atesto_meses?: number
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
          piso_competencia_id: string | null
          pvh_competencia_id: string | null
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
          piso_competencia_id?: string | null
          pvh_competencia_id?: string | null
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
          piso_competencia_id?: string | null
          pvh_competencia_id?: string | null
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
          {
            foreignKeyName: "historico_logs_pvh_competencia_id_fkey"
            columns: ["pvh_competencia_id"]
            isOneToOne: false
            referencedRelation: "pvh_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamento_marco_tempo: {
        Row: {
          id: string
          lancamento_id: string
          marco: string
          ocorrido_em: string
        }
        Insert: {
          id?: string
          lancamento_id: string
          marco: string
          ocorrido_em?: string
        }
        Update: {
          id?: string
          lancamento_id?: string
          marco?: string
          ocorrido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_marco_tempo_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_pagamento: {
        Row: {
          aviso_enc_sefaz: boolean
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
          link_aviso_liquidacao_sei: string | null
          link_certidoes_sei: string | null
          link_comprovante_pagamento_sei: string | null
          link_empenho_sei: string | null
          link_memorando_sei: string | null
          link_minuta_sei: string | null
          link_portaria_sei: string | null
          link_programacao_pagamento_sei: string | null
          link_relatorio_analise_sei: string | null
          link_relatorio_tecnico_sei: string | null
          link_solicitacao_anulacao: string | null
          link_solicitacao_liberacao_sei: string | null
          link_solicitacao_liquidacao_sei: string | null
          link_solicitacao_sei: string | null
          link_subempenho_sei: string | null
          mes_pagamento_previsto: string | null
          minuta_enc_ses: boolean
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
          valor_liquidado: number | null
          valor_solicitado: number | null
        }
        Insert: {
          aviso_enc_sefaz?: boolean
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
          link_aviso_liquidacao_sei?: string | null
          link_certidoes_sei?: string | null
          link_comprovante_pagamento_sei?: string | null
          link_empenho_sei?: string | null
          link_memorando_sei?: string | null
          link_minuta_sei?: string | null
          link_portaria_sei?: string | null
          link_programacao_pagamento_sei?: string | null
          link_relatorio_analise_sei?: string | null
          link_relatorio_tecnico_sei?: string | null
          link_solicitacao_anulacao?: string | null
          link_solicitacao_liberacao_sei?: string | null
          link_solicitacao_liquidacao_sei?: string | null
          link_solicitacao_sei?: string | null
          link_subempenho_sei?: string | null
          mes_pagamento_previsto?: string | null
          minuta_enc_ses?: boolean
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
          valor_liquidado?: number | null
          valor_solicitado?: number | null
        }
        Update: {
          aviso_enc_sefaz?: boolean
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
          link_aviso_liquidacao_sei?: string | null
          link_certidoes_sei?: string | null
          link_comprovante_pagamento_sei?: string | null
          link_empenho_sei?: string | null
          link_memorando_sei?: string | null
          link_minuta_sei?: string | null
          link_portaria_sei?: string | null
          link_programacao_pagamento_sei?: string | null
          link_relatorio_analise_sei?: string | null
          link_relatorio_tecnico_sei?: string | null
          link_solicitacao_anulacao?: string | null
          link_solicitacao_liberacao_sei?: string | null
          link_solicitacao_liquidacao_sei?: string | null
          link_solicitacao_sei?: string | null
          link_subempenho_sei?: string | null
          mes_pagamento_previsto?: string | null
          minuta_enc_ses?: boolean
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
          valor_liquidado?: number | null
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
          piso_competencia_id: string | null
          pvh_competencia_id: string | null
          pvh_competencia_id: string | null
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
          piso_competencia_id?: string | null
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
          piso_competencia_id?: string | null
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
          {
            foreignKeyName: "notificacoes_piso_competencia_id_fkey"
            columns: ["piso_competencia_id"]
            isOneToOne: false
            referencedRelation: "piso_competencias"
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
      piso_arquivos: {
        Row: {
          categoria: string
          competencia_id: string
          documento_id: string | null
          enviado_em: string
          enviado_por: string | null
          enviado_por_nome: string | null
          id: string
          mime: string | null
          nome_original: string
          participante_id: string | null
          sha256: string | null
          storage_path: string
          tamanho: number | null
        }
        Insert: {
          categoria: string
          competencia_id: string
          documento_id?: string | null
          enviado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime?: string | null
          nome_original: string
          participante_id?: string | null
          sha256?: string | null
          storage_path: string
          tamanho?: number | null
        }
        Update: {
          categoria?: string
          competencia_id?: string
          documento_id?: string | null
          enviado_em?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          mime?: string | null
          nome_original?: string
          participante_id?: string | null
          sha256?: string | null
          storage_path?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "piso_arquivos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "piso_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_arquivos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "piso_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_arquivos_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "piso_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_assinatura_matriz: {
        Row: {
          cargos: string[]
          created_at: string
          id: string
          label: string
          manual: boolean
          opcional: boolean
          ordem: number
          qualquer: boolean
          slot_key: string
          tipo_documento: string
        }
        Insert: {
          cargos?: string[]
          created_at?: string
          id?: string
          label: string
          manual?: boolean
          opcional?: boolean
          ordem?: number
          qualquer?: boolean
          slot_key: string
          tipo_documento: string
        }
        Update: {
          cargos?: string[]
          created_at?: string
          id?: string
          label?: string
          manual?: boolean
          opcional?: boolean
          ordem?: number
          qualquer?: boolean
          slot_key?: string
          tipo_documento?: string
        }
        Relationships: []
      }
      piso_competencias: {
        Row: {
          acerto_contas: number | null
          acerto_identificacao: string | null
          competencia: string
          conciliacao_excecao_em: string | null
          conciliacao_excecao_por: string | null
          conclusao_ocorrencia: string | null
          created_at: string
          created_by: string | null
          credito_fms_data: string | null
          credito_fms_link: string | null
          credito_fms_referencia: string | null
          credito_fms_valor: number | null
          desconto_identificacao: string | null
          desconto_saldo: number | null
          encerrada_em: string | null
          encerrada_por: string | null
          etapas_concluidas: Json
          etapas_reconferir: number[]
          fonte_recurso_atual: string | null
          fonte_saldo_afc: string | null
          id: string
          investsus_auditoria: Json
          investsus_carga_em: string | null
          investsus_confirmacao_em: string | null
          investsus_ocorrencia: string | null
          investsus_resumo: Json | null
          justificativa_conciliacao: string | null
          justificativa_credito: string | null
          link_processo_sei: string | null
          municipal_config: Json
          observacao: string | null
          portaria_gm_data_ato: string | null
          portaria_gm_data_publicacao: string | null
          portaria_gm_edicao: string | null
          portaria_gm_numero: string | null
          portaria_gm_pagina: string | null
          portaria_gm_secao: string | null
          portaria_gm_url_dou: string | null
          prestacao_aprovada_em: string | null
          prestacao_observacao: string | null
          prestacao_prazo: string | null
          prestacao_recebida_em: string | null
          prestacao_status: string
          processo_sei: string | null
          relatorio_gerado_em: string | null
          saldo_afc_anterior: number | null
          status: string
          total_publicado_municipal: number | null
          updated_at: string
          valor_apurado_investsus: number | null
          valor_homologado: number | null
          valor_transferido: number | null
        }
        Insert: {
          acerto_contas?: number | null
          acerto_identificacao?: string | null
          competencia: string
          conciliacao_excecao_em?: string | null
          conciliacao_excecao_por?: string | null
          conclusao_ocorrencia?: string | null
          created_at?: string
          created_by?: string | null
          credito_fms_data?: string | null
          credito_fms_link?: string | null
          credito_fms_referencia?: string | null
          credito_fms_valor?: number | null
          desconto_identificacao?: string | null
          desconto_saldo?: number | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          etapas_concluidas?: Json
          etapas_reconferir?: number[]
          fonte_recurso_atual?: string | null
          fonte_saldo_afc?: string | null
          id?: string
          investsus_auditoria?: Json
          investsus_carga_em?: string | null
          investsus_confirmacao_em?: string | null
          investsus_ocorrencia?: string | null
          investsus_resumo?: Json | null
          justificativa_conciliacao?: string | null
          justificativa_credito?: string | null
          link_processo_sei?: string | null
          municipal_config?: Json
          observacao?: string | null
          portaria_gm_data_ato?: string | null
          portaria_gm_data_publicacao?: string | null
          portaria_gm_edicao?: string | null
          portaria_gm_numero?: string | null
          portaria_gm_pagina?: string | null
          portaria_gm_secao?: string | null
          portaria_gm_url_dou?: string | null
          prestacao_aprovada_em?: string | null
          prestacao_observacao?: string | null
          prestacao_prazo?: string | null
          prestacao_recebida_em?: string | null
          prestacao_status?: string
          processo_sei?: string | null
          relatorio_gerado_em?: string | null
          saldo_afc_anterior?: number | null
          status?: string
          total_publicado_municipal?: number | null
          updated_at?: string
          valor_apurado_investsus?: number | null
          valor_homologado?: number | null
          valor_transferido?: number | null
        }
        Update: {
          acerto_contas?: number | null
          acerto_identificacao?: string | null
          competencia?: string
          conciliacao_excecao_em?: string | null
          conciliacao_excecao_por?: string | null
          conclusao_ocorrencia?: string | null
          created_at?: string
          created_by?: string | null
          credito_fms_data?: string | null
          credito_fms_link?: string | null
          credito_fms_referencia?: string | null
          credito_fms_valor?: number | null
          desconto_identificacao?: string | null
          desconto_saldo?: number | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          etapas_concluidas?: Json
          etapas_reconferir?: number[]
          fonte_recurso_atual?: string | null
          fonte_saldo_afc?: string | null
          id?: string
          investsus_auditoria?: Json
          investsus_carga_em?: string | null
          investsus_confirmacao_em?: string | null
          investsus_ocorrencia?: string | null
          investsus_resumo?: Json | null
          justificativa_conciliacao?: string | null
          justificativa_credito?: string | null
          link_processo_sei?: string | null
          municipal_config?: Json
          observacao?: string | null
          portaria_gm_data_ato?: string | null
          portaria_gm_data_publicacao?: string | null
          portaria_gm_edicao?: string | null
          portaria_gm_numero?: string | null
          portaria_gm_pagina?: string | null
          portaria_gm_secao?: string | null
          portaria_gm_url_dou?: string | null
          prestacao_aprovada_em?: string | null
          prestacao_observacao?: string | null
          prestacao_prazo?: string | null
          prestacao_recebida_em?: string | null
          prestacao_status?: string
          processo_sei?: string | null
          relatorio_gerado_em?: string | null
          saldo_afc_anterior?: number | null
          status?: string
          total_publicado_municipal?: number | null
          updated_at?: string
          valor_apurado_investsus?: number | null
          valor_homologado?: number | null
          valor_transferido?: number | null
        }
        Relationships: []
      }
      piso_documento_assinaturas: {
        Row: {
          assinado_em: string
          assinado_por: string | null
          cargo: string | null
          created_at: string
          documento_id: string
          id: string
          servidor_nome: string | null
          slot: string
        }
        Insert: {
          assinado_em?: string
          assinado_por?: string | null
          cargo?: string | null
          created_at?: string
          documento_id: string
          id?: string
          servidor_nome?: string | null
          slot: string
        }
        Update: {
          assinado_em?: string
          assinado_por?: string | null
          cargo?: string | null
          created_at?: string
          documento_id?: string
          id?: string
          servidor_nome?: string | null
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "piso_documento_assinaturas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "piso_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_documentos: {
        Row: {
          competencia_id: string
          created_at: string
          dados: Json
          data_documento: string | null
          id: string
          link_sei: string | null
          numero: string | null
          numero_sei: string | null
          obrigacao_id: string | null
          participante_id: string | null
          tipo: string
          updated_at: string
          updated_by: string | null
          updated_by_nome: string | null
        }
        Insert: {
          competencia_id: string
          created_at?: string
          dados?: Json
          data_documento?: string | null
          id?: string
          link_sei?: string | null
          numero?: string | null
          numero_sei?: string | null
          obrigacao_id?: string | null
          participante_id?: string | null
          tipo: string
          updated_at?: string
          updated_by?: string | null
          updated_by_nome?: string | null
        }
        Update: {
          competencia_id?: string
          created_at?: string
          dados?: Json
          data_documento?: string | null
          id?: string
          link_sei?: string | null
          numero?: string | null
          numero_sei?: string | null
          obrigacao_id?: string | null
          participante_id?: string | null
          tipo?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piso_documentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "piso_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_documentos_obrigacao_id_fkey"
            columns: ["obrigacao_id"]
            isOneToOne: false
            referencedRelation: "piso_obrigacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_documentos_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "piso_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_encaminhamentos: {
        Row: {
          acao: string
          destino: string | null
          documento_id: string
          id: string
          motivo: string | null
          ocorrido_em: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao?: string
          destino?: string | null
          documento_id: string
          id?: string
          motivo?: string | null
          ocorrido_em?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          destino?: string | null
          documento_id?: string
          id?: string
          motivo?: string | null
          ocorrido_em?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piso_encaminhamentos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "piso_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_feriados: {
        Row: {
          created_at: string
          data: string
          descricao: string
        }
        Insert: {
          created_at?: string
          data: string
          descricao: string
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string
        }
        Relationships: []
      }
      piso_notificacoes_email: {
        Row: {
          assunto: string
          competencia_id: string
          corpo: string
          created_at: string
          destinatarios: string[]
          enviado_em: string | null
          enviado_por: string | null
          enviado_por_nome: string | null
          id: string
          participante_id: string
          processo_sei_link: string | null
          processo_sei_numero: string | null
          updated_at: string
        }
        Insert: {
          assunto?: string
          competencia_id: string
          corpo?: string
          created_at?: string
          destinatarios?: string[]
          enviado_em?: string | null
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          participante_id: string
          processo_sei_link?: string | null
          processo_sei_numero?: string | null
          updated_at?: string
        }
        Update: {
          assunto?: string
          competencia_id?: string
          corpo?: string
          created_at?: string
          destinatarios?: string[]
          enviado_em?: string | null
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          participante_id?: string
          processo_sei_link?: string | null
          processo_sei_numero?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piso_notificacoes_email_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "piso_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_notificacoes_email_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: true
            referencedRelation: "piso_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_obrigacoes: {
        Row: {
          cr_dotacao: string | null
          created_at: string
          data_movimento_liquidacao: string | null
          data_pagamento: string | null
          data_programacao: string | null
          data_solicitacao_liquidacao: string | null
          exercicio: number | null
          fonte: string | null
          id: string
          link_processo_sei: string | null
          movimento_transmitido: boolean
          observacao: string | null
          origem_recurso: string
          participante_id: string
          processo_sei: string | null
          saldo_disponivel: number | null
          updated_at: string
          valor_a_liquidar: number | null
          valor_pago: number | null
        }
        Insert: {
          cr_dotacao?: string | null
          created_at?: string
          data_movimento_liquidacao?: string | null
          data_pagamento?: string | null
          data_programacao?: string | null
          data_solicitacao_liquidacao?: string | null
          exercicio?: number | null
          fonte?: string | null
          id?: string
          link_processo_sei?: string | null
          movimento_transmitido?: boolean
          observacao?: string | null
          origem_recurso?: string
          participante_id: string
          processo_sei?: string | null
          saldo_disponivel?: number | null
          updated_at?: string
          valor_a_liquidar?: number | null
          valor_pago?: number | null
        }
        Update: {
          cr_dotacao?: string | null
          created_at?: string
          data_movimento_liquidacao?: string | null
          data_pagamento?: string | null
          data_programacao?: string | null
          data_solicitacao_liquidacao?: string | null
          exercicio?: number | null
          fonte?: string | null
          id?: string
          link_processo_sei?: string | null
          movimento_transmitido?: boolean
          observacao?: string | null
          origem_recurso?: string
          participante_id?: string
          processo_sei?: string | null
          saldo_disponivel?: number | null
          updated_at?: string
          valor_a_liquidar?: number | null
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "piso_obrigacoes_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "piso_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_ocorrencias: {
        Row: {
          arquivo_id: string | null
          categoria: string
          cnes: string | null
          competencia_id: string
          cpf_mascarado: string | null
          created_at: string
          dados: Json
          descricao: string | null
          id: string
          instituicao_nome: string | null
          linha: number | null
          participante_id: string | null
          regra: string
          severidade: string
        }
        Insert: {
          arquivo_id?: string | null
          categoria?: string
          cnes?: string | null
          competencia_id: string
          cpf_mascarado?: string | null
          created_at?: string
          dados?: Json
          descricao?: string | null
          id?: string
          instituicao_nome?: string | null
          linha?: number | null
          participante_id?: string | null
          regra: string
          severidade?: string
        }
        Update: {
          arquivo_id?: string | null
          categoria?: string
          cnes?: string | null
          competencia_id?: string
          cpf_mascarado?: string | null
          created_at?: string
          dados?: Json
          descricao?: string | null
          id?: string
          instituicao_nome?: string | null
          linha?: number | null
          participante_id?: string | null
          regra?: string
          severidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "piso_ocorrencias_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "piso_arquivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_ocorrencias_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "piso_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_ocorrencias_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "piso_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_participante_cnes: {
        Row: {
          cnes: string
          created_at: string
          id: string
          nome_estabelecimento: string | null
          participante_id: string
        }
        Insert: {
          cnes: string
          created_at?: string
          id?: string
          nome_estabelecimento?: string | null
          participante_id: string
        }
        Update: {
          cnes?: string
          created_at?: string
          id?: string
          nome_estabelecimento?: string | null
          participante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piso_participante_cnes_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "piso_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      piso_participantes: {
        Row: {
          auditoria_resumo: Json | null
          competencia_id: string
          created_at: string
          data_envio: string | null
          data_retorno: string | null
          id: string
          observacao: string | null
          prestador_id: string
          sem_elegiveis: boolean
          situacao: string
          updated_at: string
          valor_devido: number | null
          valor_recurso_atual: number | null
          valor_saldo_afc: number | null
        }
        Insert: {
          auditoria_resumo?: Json | null
          competencia_id: string
          created_at?: string
          data_envio?: string | null
          data_retorno?: string | null
          id?: string
          observacao?: string | null
          prestador_id: string
          sem_elegiveis?: boolean
          situacao?: string
          updated_at?: string
          valor_devido?: number | null
          valor_recurso_atual?: number | null
          valor_saldo_afc?: number | null
        }
        Update: {
          auditoria_resumo?: Json | null
          competencia_id?: string
          created_at?: string
          data_envio?: string | null
          data_retorno?: string | null
          id?: string
          observacao?: string | null
          prestador_id?: string
          sem_elegiveis?: boolean
          situacao?: string
          updated_at?: string
          valor_devido?: number | null
          valor_recurso_atual?: number | null
          valor_saldo_afc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "piso_participantes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "piso_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piso_participantes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
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
      prestador_cnes: {
        Row: {
          cnes: string
          created_at: string
          id: string
          nome_estabelecimento: string | null
          prestador_id: string
        }
        Insert: {
          cnes: string
          created_at?: string
          id?: string
          nome_estabelecimento?: string | null
          prestador_id: string
        }
        Update: {
          cnes?: string
          created_at?: string
          id?: string
          nome_estabelecimento?: string | null
          prestador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestador_cnes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      prestador_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          prestador_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          prestador_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          prestador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestador_emails_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
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
      pvh_empenho_alocacoes: {
        Row: {
          created_at: string
          created_by: string | null
          empenho_id: string
          id: string
          observacao: string | null
          participante_id: string
          updated_at: string
          valor_alocado: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empenho_id: string
          id?: string
          observacao?: string | null
          participante_id: string
          updated_at?: string
          valor_alocado: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empenho_id?: string
          id?: string
          observacao?: string | null
          participante_id?: string
          updated_at?: string
          valor_alocado?: number
        }
        Relationships: [
          {
            foreignKeyName: "pvh_empenho_alocacoes_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "pvh_empenhos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_empenho_alocacoes_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "pvh_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_empenhos: {
        Row: {
          ano: number
          cr_dotacao: string | null
          created_at: string
          created_by: string | null
          data_emissao: string | null
          fonte_recurso: string | null
          id: string
          natureza_despesa: string | null
          nota_empenho_sei_link: string | null
          nota_empenho_sei_numero: string | null
          numero_ne: string
          observacao: string | null
          prestador_id: string
          processo_anual_id: string | null
          solicitacao_data: string | null
          solicitacao_sei_link: string | null
          solicitacao_sei_numero: string | null
          status: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          ano: number
          cr_dotacao?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          fonte_recurso?: string | null
          id?: string
          natureza_despesa?: string | null
          nota_empenho_sei_link?: string | null
          nota_empenho_sei_numero?: string | null
          numero_ne: string
          observacao?: string | null
          prestador_id: string
          processo_anual_id?: string | null
          solicitacao_data?: string | null
          solicitacao_sei_link?: string | null
          solicitacao_sei_numero?: string | null
          status?: string
          updated_at?: string
          valor_total: number
        }
        Update: {
          ano?: number
          cr_dotacao?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          fonte_recurso?: string | null
          id?: string
          natureza_despesa?: string | null
          nota_empenho_sei_link?: string | null
          nota_empenho_sei_numero?: string | null
          numero_ne?: string
          observacao?: string | null
          prestador_id?: string
          processo_anual_id?: string | null
          solicitacao_data?: string | null
          solicitacao_sei_link?: string | null
          solicitacao_sei_numero?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pvh_empenhos_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_empenhos_processo_anual_id_fkey"
            columns: ["processo_anual_id"]
            isOneToOne: false
            referencedRelation: "pvh_processos_anuais"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_processos_anuais: {
        Row: {
          ano: number
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          link_sei: string | null
          numero_sei: string
          prestador_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ano: number
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          link_sei?: string | null
          numero_sei: string
          prestador_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ano?: number
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          link_sei?: string | null
          numero_sei?: string
          prestador_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvh_processos_anuais_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_subempenhos: {
        Row: {
          alocacao_id: string
          created_at: string
          created_by: string | null
          id: string
          movimento_liquidacao_data: string | null
          movimento_liquidacao_sei_link: string | null
          movimento_liquidacao_sei_numero: string | null
          movimento_subempenho_data: string | null
          movimento_subempenho_sei_link: string | null
          movimento_subempenho_sei_numero: string | null
          numero_subempenho: string | null
          observacao: string | null
          processo_anual_id: string | null
          programacao_pagamento_data: string | null
          programacao_pagamento_sei_link: string | null
          programacao_pagamento_sei_numero: string | null
          solicitacao_data: string | null
          solicitacao_sei_link: string | null
          solicitacao_sei_numero: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          alocacao_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movimento_liquidacao_data?: string | null
          movimento_liquidacao_sei_link?: string | null
          movimento_liquidacao_sei_numero?: string | null
          movimento_subempenho_data?: string | null
          movimento_subempenho_sei_link?: string | null
          movimento_subempenho_sei_numero?: string | null
          numero_subempenho?: string | null
          observacao?: string | null
          processo_anual_id?: string | null
          programacao_pagamento_data?: string | null
          programacao_pagamento_sei_link?: string | null
          programacao_pagamento_sei_numero?: string | null
          solicitacao_data?: string | null
          solicitacao_sei_link?: string | null
          solicitacao_sei_numero?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          alocacao_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movimento_liquidacao_data?: string | null
          movimento_liquidacao_sei_link?: string | null
          movimento_liquidacao_sei_numero?: string | null
          movimento_subempenho_data?: string | null
          movimento_subempenho_sei_link?: string | null
          movimento_subempenho_sei_numero?: string | null
          numero_subempenho?: string | null
          observacao?: string | null
          processo_anual_id?: string | null
          programacao_pagamento_data?: string | null
          programacao_pagamento_sei_link?: string | null
          programacao_pagamento_sei_numero?: string | null
          solicitacao_data?: string | null
          solicitacao_sei_link?: string | null
          solicitacao_sei_numero?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pvh_subempenhos_alocacao_id_fkey"
            columns: ["alocacao_id"]
            isOneToOne: false
            referencedRelation: "pvh_empenho_alocacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_subempenhos_processo_anual_id_fkey"
            columns: ["processo_anual_id"]
            isOneToOne: false
            referencedRelation: "pvh_processos_anuais"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_competencias: {
        Row: {
          competencia: string
          created_at: string
          created_by: string | null
          encerrada_em: string | null
          encerrada_por: string | null
          etapas_concluidas: Json
          etapas_reconferir: number[]
          id: string
          justificativa_divergencia: string | null
          memorando_municipal_link: string | null
          memorando_municipal_numero: string | null
          minuta_municipal_link: string | null
          minuta_municipal_numero: string | null
          normativa_id: string | null
          observacao: string | null
          portaria_estadual_data: string | null
          portaria_estadual_numero: string | null
          portaria_estadual_sei_link: string | null
          portaria_estadual_sei_numero: string | null
          portaria_estadual_url: string | null
          portaria_municipal_data: string | null
          portaria_municipal_link: string | null
          portaria_municipal_numero: string | null
          recurso_fms_data: string | null
          recurso_fms_link: string | null
          recurso_fms_referencia: string | null
          recurso_fms_valor: number | null
          status: string
          updated_at: string
        }
        Insert: {
          competencia: string
          created_at?: string
          created_by?: string | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          etapas_concluidas?: Json
          etapas_reconferir?: number[]
          id?: string
          justificativa_divergencia?: string | null
          memorando_municipal_link?: string | null
          memorando_municipal_numero?: string | null
          minuta_municipal_link?: string | null
          minuta_municipal_numero?: string | null
          normativa_id?: string | null
          observacao?: string | null
          portaria_estadual_data?: string | null
          portaria_estadual_numero?: string | null
          portaria_estadual_sei_link?: string | null
          portaria_estadual_sei_numero?: string | null
          portaria_estadual_url?: string | null
          portaria_municipal_data?: string | null
          portaria_municipal_link?: string | null
          portaria_municipal_numero?: string | null
          recurso_fms_data?: string | null
          recurso_fms_link?: string | null
          recurso_fms_referencia?: string | null
          recurso_fms_valor?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          competencia?: string
          created_at?: string
          created_by?: string | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          etapas_concluidas?: Json
          etapas_reconferir?: number[]
          id?: string
          justificativa_divergencia?: string | null
          memorando_municipal_link?: string | null
          memorando_municipal_numero?: string | null
          minuta_municipal_link?: string | null
          minuta_municipal_numero?: string | null
          normativa_id?: string | null
          observacao?: string | null
          portaria_estadual_data?: string | null
          portaria_estadual_numero?: string | null
          portaria_estadual_sei_link?: string | null
          portaria_estadual_sei_numero?: string | null
          portaria_estadual_url?: string | null
          portaria_municipal_data?: string | null
          portaria_municipal_link?: string | null
          portaria_municipal_numero?: string | null
          recurso_fms_data?: string | null
          recurso_fms_link?: string | null
          recurso_fms_referencia?: string | null
          recurso_fms_valor?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvh_competencias_normativa_id_fkey"
            columns: ["normativa_id"]
            isOneToOne: false
            referencedRelation: "pvh_normativas"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_normativas: {
        Row: {
          ativa: boolean
          codigo: string
          created_at: string
          created_by: string | null
          data_ato: string | null
          id: string
          numero: string | null
          observacao: string | null
          tipo: string
          titulo: string
          url_oficial: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          ativa?: boolean
          codigo: string
          created_at?: string
          created_by?: string | null
          data_ato?: string | null
          id?: string
          numero?: string | null
          observacao?: string | null
          tipo?: string
          titulo: string
          url_oficial?: string | null
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          ativa?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          data_ato?: string | null
          id?: string
          numero?: string | null
          observacao?: string | null
          tipo?: string
          titulo?: string
          url_oficial?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: []
      }
      pvh_participantes: {
        Row: {
          competencia_id: string
          config_origem_id: string | null
          cr_dotacao: string | null
          created_at: string
          exige_prestacao_contas: boolean
          fonte_recurso: string | null
          id: string
          natureza_despesa: string | null
          notificar_email: boolean
          prazo_prestacao_contas_dias: number | null
          prestador_id: string
          processo_empenho_sei: string | null
          processo_subempenho_sei: string | null
          updated_at: string
          valor_estadual: number | null
          valor_municipal: number | null
          valor_pago: number
        }
        Insert: {
          competencia_id: string
          config_origem_id?: string | null
          cr_dotacao?: string | null
          created_at?: string
          exige_prestacao_contas?: boolean
          fonte_recurso?: string | null
          id?: string
          natureza_despesa?: string | null
          notificar_email?: boolean
          prazo_prestacao_contas_dias?: number | null
          prestador_id: string
          processo_empenho_sei?: string | null
          processo_subempenho_sei?: string | null
          updated_at?: string
          valor_estadual?: number | null
          valor_municipal?: number | null
          valor_pago?: number
        }
        Update: {
          competencia_id?: string
          config_origem_id?: string | null
          cr_dotacao?: string | null
          created_at?: string
          exige_prestacao_contas?: boolean
          fonte_recurso?: string | null
          id?: string
          natureza_despesa?: string | null
          notificar_email?: boolean
          prazo_prestacao_contas_dias?: number | null
          prestador_id?: string
          processo_empenho_sei?: string | null
          processo_subempenho_sei?: string | null
          updated_at?: string
          valor_estadual?: number | null
          valor_municipal?: number | null
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "pvh_participantes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "pvh_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_participantes_config_origem_id_fkey"
            columns: ["config_origem_id"]
            isOneToOne: false
            referencedRelation: "pvh_prestador_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_participantes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_prestador_config: {
        Row: {
          ativo: boolean
          cr_dotacao: string | null
          created_at: string
          created_by: string | null
          exige_prestacao_contas: boolean
          fonte_recurso: string | null
          id: string
          natureza_despesa: string | null
          notificar_email: boolean
          observacao: string | null
          prazo_prestacao_contas_dias: number | null
          prestador_id: string
          processo_empenho_sei: string | null
          processo_subempenho_sei: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          ativo?: boolean
          cr_dotacao?: string | null
          created_at?: string
          created_by?: string | null
          exige_prestacao_contas?: boolean
          fonte_recurso?: string | null
          id?: string
          natureza_despesa?: string | null
          notificar_email?: boolean
          observacao?: string | null
          prazo_prestacao_contas_dias?: number | null
          prestador_id: string
          processo_empenho_sei?: string | null
          processo_subempenho_sei?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          ativo?: boolean
          cr_dotacao?: string | null
          created_at?: string
          created_by?: string | null
          exige_prestacao_contas?: boolean
          fonte_recurso?: string | null
          id?: string
          natureza_despesa?: string | null
          notificar_email?: boolean
          observacao?: string | null
          prazo_prestacao_contas_dias?: number | null
          prestador_id?: string
          processo_empenho_sei?: string | null
          processo_subempenho_sei?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvh_prestador_config_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cacon_confirmar_extracao: {
        Args: { p_competencia: string }
        Returns: undefined
      }
      cacon_registrar_falha_extracao: {
        Args: {
          p_arquivo: string
          p_competencia: string
          p_erro: string
          p_sha256: string
        }
        Returns: undefined
      }
      cacon_salvar_conferencia_manual: {
        Args: { p_competencia: string; p_dados: Json }
        Returns: undefined
      }
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
      piso_etapa_doc: { Args: { p_tipo: string }; Returns: number }
      pvh_marcar_reconferencia: {
        Args: { p_comp: string; p_etapa: number }
        Returns: undefined
      }
      piso_marcar_reconferencia: {
        Args: { p_comp: string; p_etapa: number }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
