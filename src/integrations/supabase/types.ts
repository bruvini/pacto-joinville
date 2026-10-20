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
      ec_cnes_instituicoes: {
        Row: {
          cnes: string
          informacao: string
          informado_em: string
          prestador_id: string
        }
        Insert: {
          cnes: string
          informacao?: string
          informado_em?: string
          prestador_id: string
        }
        Update: {
          cnes?: string
          informacao?: string
          informado_em?: string
          prestador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_cnes_instituicoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: true
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_arquivos: {
        Row: {
          categoria: string
          competencia_id: string
          enviado_em: string
          enviado_por: string | null
          id: string
          nome_original: string
          sha256: string
          storage_path: string
          tamanho: number
        }
        Insert: {
          categoria: string
          competencia_id: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          nome_original: string
          sha256: string
          storage_path: string
          tamanho: number
        }
        Update: {
          categoria?: string
          competencia_id?: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          nome_original?: string
          sha256?: string
          storage_path?: string
          tamanho?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_arquivos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_atesto_escolhas: {
        Row: {
          automatico_no_ato: number | null
          competencia_id: string | null
          escolhido_em: string
          escolhido_por: string
          id: string
          lancamento_id: string
          manual_no_ato: number | null
          motivo: string
          origem_anterior: string | null
          origem_nova: string
          sei: string
          valor_anterior: number | null
          valor_novo: number | null
        }
        Insert: {
          automatico_no_ato?: number | null
          competencia_id?: string | null
          escolhido_em?: string
          escolhido_por: string
          id?: string
          lancamento_id: string
          manual_no_ato?: number | null
          motivo: string
          origem_anterior?: string | null
          origem_nova: string
          sei: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Update: {
          automatico_no_ato?: number | null
          competencia_id?: string | null
          escolhido_em?: string
          escolhido_por?: string
          id?: string
          lancamento_id?: string
          manual_no_ato?: number | null
          motivo?: string
          origem_anterior?: string | null
          origem_nova?: string
          sei?: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_atesto_escolhas_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_atesto_escolhas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_atos_especiais: {
        Row: {
          aba: string
          arquivo_id: string | null
          autor: string
          competencia_id: string
          documento_sei: string | null
          fundamento: string
          id: string
          norma: string
          registrado_em: string
          regra_comprovada: boolean
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          aba: string
          arquivo_id?: string | null
          autor?: string
          competencia_id: string
          documento_sei?: string | null
          fundamento?: string
          id?: string
          norma: string
          registrado_em?: string
          regra_comprovada?: boolean
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          aba?: string
          arquivo_id?: string | null
          autor?: string
          competencia_id?: string
          documento_sei?: string | null
          fundamento?: string
          id?: string
          norma?: string
          registrado_em?: string
          regra_comprovada?: boolean
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_atos_especiais_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "eletivas_arquivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_atos_especiais_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_competencias: {
        Row: {
          arquivada_em: string | null
          arquivada_motivo: string | null
          arquivada_por: string | null
          atualizado_em: string
          cnes: string
          competencia: string
          correcoes: Json
          criado_em: string
          criado_por: string | null
          documentos: Json
          ec_execucao_id: string | null
          ec_fontes_snapshot: Json | null
          ec_motor_versao: string | null
          ec_origem_execucao: string | null
          ec_processado_em: string | null
          ec_validado_em: string | null
          ec_validado_por: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          lancamento_id: string | null
          observacao: string | null
          prestador_id: string
          status: string
          valor_fechado: number | null
        }
        Insert: {
          arquivada_em?: string | null
          arquivada_motivo?: string | null
          arquivada_por?: string | null
          atualizado_em?: string
          cnes?: string
          competencia: string
          correcoes?: Json
          criado_em?: string
          criado_por?: string | null
          documentos?: Json
          ec_execucao_id?: string | null
          ec_fontes_snapshot?: Json | null
          ec_motor_versao?: string | null
          ec_origem_execucao?: string | null
          ec_processado_em?: string | null
          ec_validado_em?: string | null
          ec_validado_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          prestador_id: string
          status?: string
          valor_fechado?: number | null
        }
        Update: {
          arquivada_em?: string | null
          arquivada_motivo?: string | null
          arquivada_por?: string | null
          atualizado_em?: string
          cnes?: string
          competencia?: string
          correcoes?: Json
          criado_em?: string
          criado_por?: string | null
          documentos?: Json
          ec_execucao_id?: string | null
          ec_fontes_snapshot?: Json | null
          ec_motor_versao?: string | null
          ec_origem_execucao?: string | null
          ec_processado_em?: string | null
          ec_validado_em?: string | null
          ec_validado_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          prestador_id?: string
          status?: string
          valor_fechado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_competencias_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_competencias_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_comunicacoes: {
        Row: {
          aih: string | null
          assinatura: string
          assunto: string | null
          atualizado_em: string
          atualizado_por: string
          competencia_id: string
          criado_em: string
          destino: string
          enviada_em: string | null
          enviada_por: string | null
          fluxo_id: string | null
          id: string
          item_id: string | null
          protocolo: string | null
          referencia: string
          situacao: string
          tipo: string
          versao: number
        }
        Insert: {
          aih?: string | null
          assinatura: string
          assunto?: string | null
          atualizado_em?: string
          atualizado_por: string
          competencia_id: string
          criado_em?: string
          destino: string
          enviada_em?: string | null
          enviada_por?: string | null
          fluxo_id?: string | null
          id?: string
          item_id?: string | null
          protocolo?: string | null
          referencia: string
          situacao: string
          tipo: string
          versao?: number
        }
        Update: {
          aih?: string | null
          assinatura?: string
          assunto?: string | null
          atualizado_em?: string
          atualizado_por?: string
          competencia_id?: string
          criado_em?: string
          destino?: string
          enviada_em?: string | null
          enviada_por?: string | null
          fluxo_id?: string | null
          id?: string
          item_id?: string | null
          protocolo?: string | null
          referencia?: string
          situacao?: string
          tipo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_comunicacoes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_comunicacoes_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "eletivas_fpo_fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_comunicacoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "eletivas_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_comunicacoes_eventos: {
        Row: {
          acao: string
          assunto: string | null
          autor: string
          competencia_id: string
          comunicacao_id: string
          conteudo_md5: string | null
          destino_anterior: string | null
          destino_novo: string
          id: number
          justificativa: string
          protocolo: string | null
          registrado_em: string
          situacao_anterior: string | null
          situacao_nova: string
        }
        Insert: {
          acao: string
          assunto?: string | null
          autor: string
          competencia_id: string
          comunicacao_id: string
          conteudo_md5?: string | null
          destino_anterior?: string | null
          destino_novo: string
          id?: never
          justificativa: string
          protocolo?: string | null
          registrado_em?: string
          situacao_anterior?: string | null
          situacao_nova: string
        }
        Update: {
          acao?: string
          assunto?: string | null
          autor?: string
          competencia_id?: string
          comunicacao_id?: string
          conteudo_md5?: string | null
          destino_anterior?: string | null
          destino_novo?: string
          id?: never
          justificativa?: string
          protocolo?: string | null
          registrado_em?: string
          situacao_anterior?: string | null
          situacao_nova?: string
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_comunicacoes_eventos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_comunicacoes_eventos_comunicacao_id_fkey"
            columns: ["comunicacao_id"]
            isOneToOne: false
            referencedRelation: "eletivas_comunicacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_correcoes: {
        Row: {
          aihs: string[]
          competencia_id: string
          competencia_origem: string
          criado_em: string
          criado_por: string | null
          documento_sei: string
          fingerprint: string
          fonte_origem: string
          id: string
          justificativa_revisao: string | null
          motivo: string
          origem_legada_indice: number | null
          prestador_id: string
          referencia_origem: string
          revisado_em: string | null
          revisado_por: string | null
          status: string
          valor: number
        }
        Insert: {
          aihs?: string[]
          competencia_id: string
          competencia_origem: string
          criado_em?: string
          criado_por?: string | null
          documento_sei: string
          fingerprint: string
          fonte_origem: string
          id?: string
          justificativa_revisao?: string | null
          motivo: string
          origem_legada_indice?: number | null
          prestador_id: string
          referencia_origem: string
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          valor: number
        }
        Update: {
          aihs?: string[]
          competencia_id?: string
          competencia_origem?: string
          criado_em?: string
          criado_por?: string | null
          documento_sei?: string
          fingerprint?: string
          fonte_origem?: string
          id?: string
          justificativa_revisao?: string | null
          motivo?: string
          origem_legada_indice?: number | null
          prestador_id?: string
          referencia_origem?: string
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_correcoes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_correcoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_decisoes_revisoes: {
        Row: {
          autor: string
          competencia_id: string
          decisao_anterior: string | null
          decisao_nova: string
          id: number
          item_id: string
          justificativa_anterior: string | null
          justificativa_nova: string
          motivo_revisao: string | null
          registrado_em: string
          versao: number
        }
        Insert: {
          autor: string
          competencia_id: string
          decisao_anterior?: string | null
          decisao_nova: string
          id?: never
          item_id: string
          justificativa_anterior?: string | null
          justificativa_nova: string
          motivo_revisao?: string | null
          registrado_em?: string
          versao: number
        }
        Update: {
          autor?: string
          competencia_id?: string
          decisao_anterior?: string | null
          decisao_nova?: string
          id?: never
          item_id?: string
          justificativa_anterior?: string | null
          justificativa_nova?: string
          motivo_revisao?: string | null
          registrado_em?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_decisoes_revisoes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_decisoes_revisoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "eletivas_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_eventos: {
        Row: {
          autor: string | null
          competencia_id: string
          dados: Json
          id: number
          ocorrido_em: string
          tipo: string
        }
        Insert: {
          autor?: string | null
          competencia_id: string
          dados?: Json
          id?: never
          ocorrido_em?: string
          tipo: string
        }
        Update: {
          autor?: string | null
          competencia_id?: string
          dados?: Json
          id?: never
          ocorrido_em?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_eventos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_exclusoes: {
        Row: {
          caminhos_storage: string[]
          cnes: string
          competencia: string
          competencia_id_original: string
          eventos_json: Json
          excluido_em: string
          excluido_por: string
          id: string
          lancamento_id: string | null
          limpeza_storage_em: string | null
          limpeza_storage_por: string | null
          motivo: string
          observacao: string | null
          prestador_id: string
          resumo_exclusao: Json
        }
        Insert: {
          caminhos_storage?: string[]
          cnes: string
          competencia: string
          competencia_id_original: string
          eventos_json: Json
          excluido_em?: string
          excluido_por: string
          id?: string
          lancamento_id?: string | null
          limpeza_storage_em?: string | null
          limpeza_storage_por?: string | null
          motivo: string
          observacao?: string | null
          prestador_id: string
          resumo_exclusao?: Json
        }
        Update: {
          caminhos_storage?: string[]
          cnes?: string
          competencia?: string
          competencia_id_original?: string
          eventos_json?: Json
          excluido_em?: string
          excluido_por?: string
          id?: string
          lancamento_id?: string | null
          limpeza_storage_em?: string | null
          limpeza_storage_por?: string | null
          motivo?: string
          observacao?: string | null
          prestador_id?: string
          resumo_exclusao?: Json
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_exclusoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_exclusoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fase8_autorizacoes: {
        Row: {
          autorizado_em: string
          autorizado_por: string
          documento_sei: string
          id: string
          justificativa: string
          motivo_revogacao: string | null
          prestador_id: string
          revogado_em: string | null
          revogado_por: string | null
        }
        Insert: {
          autorizado_em?: string
          autorizado_por: string
          documento_sei: string
          id?: string
          justificativa: string
          motivo_revogacao?: string | null
          prestador_id: string
          revogado_em?: string | null
          revogado_por?: string | null
        }
        Update: {
          autorizado_em?: string
          autorizado_por?: string
          documento_sei?: string
          id?: string
          justificativa?: string
          motivo_revogacao?: string | null
          prestador_id?: string
          revogado_em?: string | null
          revogado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fase8_autorizacoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: true
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fase8_eventos: {
        Row: {
          acao: string
          dados: Json
          id: number
          ocorrido_em: string
          prestador_id: string
          responsavel: string
          validacao_id: string | null
        }
        Insert: {
          acao: string
          dados?: Json
          id?: never
          ocorrido_em?: string
          prestador_id: string
          responsavel: string
          validacao_id?: string | null
        }
        Update: {
          acao?: string
          dados?: Json
          id?: never
          ocorrido_em?: string
          prestador_id?: string
          responsavel?: string
          validacao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fase8_eventos_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_fase8_eventos_validacao_id_fkey"
            columns: ["validacao_id"]
            isOneToOne: false
            referencedRelation: "eletivas_fase8_validacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fase8_validacoes: {
        Row: {
          competencia_id: string
          divergencias_financeiras: number
          divergencias_funcionais: number
          documento_sei: string
          execucao_id: string
          hash_html: string
          hash_manifesto: string
          hash_react: string
          id: string
          justificativa: string
          perfil: string
          prestador_id: string
          responsavel: string
          validacao_fiscal_declarada: boolean
          validado_em: string
          verificacoes: Json
        }
        Insert: {
          competencia_id: string
          divergencias_financeiras: number
          divergencias_funcionais: number
          documento_sei: string
          execucao_id: string
          hash_html: string
          hash_manifesto: string
          hash_react: string
          id?: string
          justificativa: string
          perfil: string
          prestador_id: string
          responsavel: string
          validacao_fiscal_declarada?: boolean
          validado_em?: string
          verificacoes: Json
        }
        Update: {
          competencia_id?: string
          divergencias_financeiras?: number
          divergencias_funcionais?: number
          documento_sei?: string
          execucao_id?: string
          hash_html?: string
          hash_manifesto?: string
          hash_react?: string
          id?: string
          justificativa?: string
          perfil?: string
          prestador_id?: string
          responsavel?: string
          validacao_fiscal_declarada?: boolean
          validado_em?: string
          verificacoes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fase8_validacoes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: true
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_fase8_validacoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fechamentos: {
        Row: {
          competencia_id: string
          conteudo_md5: string
          dados_snapshot: Json
          execucao_id: string
          fechamento_autor: string
          fechamento_em: string
          fontes_snapshot: Json
          id: string
          justificativa: string
          motor_versao: string
          revisao: number
          sei_conferencia: string
          valor_fechado: number
        }
        Insert: {
          competencia_id: string
          conteudo_md5: string
          dados_snapshot: Json
          execucao_id: string
          fechamento_autor: string
          fechamento_em?: string
          fontes_snapshot: Json
          id?: string
          justificativa: string
          motor_versao: string
          revisao: number
          sei_conferencia: string
          valor_fechado: number
        }
        Update: {
          competencia_id?: string
          conteudo_md5?: string
          dados_snapshot?: Json
          execucao_id?: string
          fechamento_autor?: string
          fechamento_em?: string
          fontes_snapshot?: Json
          id?: string
          justificativa?: string
          motor_versao?: string
          revisao?: number
          sei_conferencia?: string
          valor_fechado?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fechamentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fpo_fluxos: {
        Row: {
          aih: string
          atualizado_em: string
          atualizado_por: string | null
          competencia_id: string
          criado_em: string
          criado_por: string
          documento_sei: string | null
          etapa: number
          id: string
          item_id: string | null
          observacao: string | null
          situacao: string
          valor_estimado: number
          versao: number
        }
        Insert: {
          aih: string
          atualizado_em?: string
          atualizado_por?: string | null
          competencia_id: string
          criado_em?: string
          criado_por: string
          documento_sei?: string | null
          etapa?: number
          id?: string
          item_id?: string | null
          observacao?: string | null
          situacao?: string
          valor_estimado?: number
          versao?: number
        }
        Update: {
          aih?: string
          atualizado_em?: string
          atualizado_por?: string | null
          competencia_id?: string
          criado_em?: string
          criado_por?: string
          documento_sei?: string | null
          etapa?: number
          id?: string
          item_id?: string | null
          observacao?: string | null
          situacao?: string
          valor_estimado?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fpo_fluxos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_fpo_fluxos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "eletivas_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fpo_fluxos_eventos: {
        Row: {
          acao: string
          autor: string
          competencia_id: string
          criado_em: string
          documento_sei: string | null
          etapa_anterior: number | null
          etapa_nova: number | null
          fluxo_id: string
          id: number
          justificativa: string
        }
        Insert: {
          acao: string
          autor: string
          competencia_id: string
          criado_em?: string
          documento_sei?: string | null
          etapa_anterior?: number | null
          etapa_nova?: number | null
          fluxo_id: string
          id?: never
          justificativa: string
        }
        Update: {
          acao?: string
          autor?: string
          competencia_id?: string
          criado_em?: string
          documento_sei?: string | null
          etapa_anterior?: number | null
          etapa_nova?: number | null
          fluxo_id?: string
          id?: never
          justificativa?: string
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fpo_fluxos_eventos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_fpo_fluxos_eventos_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "eletivas_fpo_fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fpo_programacoes: {
        Row: {
          autor: string
          competencia_id: string
          competencia_programacao: string
          documento_sei: string
          fundamento: string
          id: string
          link_sei: string
          procedimento: string
          registrado_em: string
          valor_federal_unitario: number
          vigencia_fim: string
          vigencia_inicio: string
        }
        Insert: {
          autor?: string
          competencia_id: string
          competencia_programacao: string
          documento_sei: string
          fundamento: string
          id?: string
          link_sei: string
          procedimento: string
          registrado_em?: string
          valor_federal_unitario: number
          vigencia_fim: string
          vigencia_inicio: string
        }
        Update: {
          autor?: string
          competencia_id?: string
          competencia_programacao?: string
          documento_sei?: string
          fundamento?: string
          id?: string
          link_sei?: string
          procedimento?: string
          registrado_em?: string
          valor_federal_unitario?: number
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fpo_programacoes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_fpo_vinculos: {
        Row: {
          competencia_id: string
          correcao_id: string
          fluxo_id: string
          id: string
          justificativa: string
          vinculado_em: string
          vinculado_por: string
        }
        Insert: {
          competencia_id: string
          correcao_id: string
          fluxo_id: string
          id?: string
          justificativa: string
          vinculado_em?: string
          vinculado_por: string
        }
        Update: {
          competencia_id?: string
          correcao_id?: string
          fluxo_id?: string
          id?: string
          justificativa?: string
          vinculado_em?: string
          vinculado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_fpo_vinculos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_fpo_vinculos_correcao_id_fkey"
            columns: ["correcao_id"]
            isOneToOne: true
            referencedRelation: "eletivas_correcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_fpo_vinculos_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "eletivas_fpo_fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_integracoes: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          competencia: string
          competencia_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          convenio_id: string
          diferenca: number
          fechamento_id: string
          id: string
          justificativa: string
          lancamento_id: string
          motivo_cancelamento: string | null
          prestador_id: string
          proposto_em: string
          proposto_por: string
          sei_autorizacao: string
          status: string
          valor_anterior: number | null
          valor_novo: number
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          competencia: string
          competencia_id: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          convenio_id: string
          diferenca: number
          fechamento_id: string
          id?: string
          justificativa: string
          lancamento_id: string
          motivo_cancelamento?: string | null
          prestador_id: string
          proposto_em?: string
          proposto_por: string
          sei_autorizacao: string
          status?: string
          valor_anterior?: number | null
          valor_novo: number
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          competencia?: string
          competencia_id?: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          convenio_id?: string
          diferenca?: number
          fechamento_id?: string
          id?: string
          justificativa?: string
          lancamento_id?: string
          motivo_cancelamento?: string | null
          prestador_id?: string
          proposto_em?: string
          proposto_por?: string
          sei_autorizacao?: string
          status?: string
          valor_anterior?: number | null
          valor_novo?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_integracoes_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_integracoes_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_integracoes_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "eletivas_fechamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_integracoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eletivas_integracoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "prestadores"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_itens: {
        Row: {
          aih: string | null
          atualizado_em: string
          categoria: string
          chave: string
          competencia_id: string
          conferido_em: string | null
          conferido_por: string | null
          decisao: string | null
          decisao_versao: number
          descricao: string
          detalhe: Json
          ec_execucao_id: string | null
          id: string
          justificativa: string | null
          origem: string
          procedimento: string | null
          situacao: string
          valor_esperado: number
          valor_publicado: number
        }
        Insert: {
          aih?: string | null
          atualizado_em?: string
          categoria: string
          chave: string
          competencia_id: string
          conferido_em?: string | null
          conferido_por?: string | null
          decisao?: string | null
          decisao_versao?: number
          descricao: string
          detalhe?: Json
          ec_execucao_id?: string | null
          id?: string
          justificativa?: string | null
          origem?: string
          procedimento?: string | null
          situacao?: string
          valor_esperado?: number
          valor_publicado?: number
        }
        Update: {
          aih?: string | null
          atualizado_em?: string
          categoria?: string
          chave?: string
          competencia_id?: string
          conferido_em?: string | null
          conferido_por?: string | null
          decisao?: string | null
          decisao_versao?: number
          descricao?: string
          detalhe?: Json
          ec_execucao_id?: string | null
          id?: string
          justificativa?: string | null
          origem?: string
          procedimento?: string | null
          situacao?: string
          valor_esperado?: number
          valor_publicado?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_itens_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eletivas_publicacoes_aih: {
        Row: {
          aih: string
          autor: string
          competencia_id: string
          documento_sei: string
          fundamento: string
          id: string
          link_sei: string
          registrado_em: string
          valor_publicado: number
        }
        Insert: {
          aih: string
          autor?: string
          competencia_id: string
          documento_sei: string
          fundamento: string
          id?: string
          link_sei: string
          registrado_em?: string
          valor_publicado: number
        }
        Update: {
          aih?: string
          autor?: string
          competencia_id?: string
          documento_sei?: string
          fundamento?: string
          id?: string
          link_sei?: string
          registrado_em?: string
          valor_publicado?: number
        }
        Relationships: [
          {
            foreignKeyName: "eletivas_publicacoes_aih_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "eletivas_competencias"
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
      lancamentos_atesto_origem_historica: {
        Row: {
          escolha_pendente_original: boolean | null
          lancamento_id: string
          origem_original: string | null
          registrado_em: string
          valor_automatico_original: number | null
          valor_efetivo_original: number | null
          valor_manual_original: number | null
        }
        Insert: {
          escolha_pendente_original?: boolean | null
          lancamento_id: string
          origem_original?: string | null
          registrado_em?: string
          valor_automatico_original?: number | null
          valor_efetivo_original?: number | null
          valor_manual_original?: number | null
        }
        Update: {
          escolha_pendente_original?: boolean | null
          lancamento_id?: string
          origem_original?: string | null
          registrado_em?: string
          valor_automatico_original?: number | null
          valor_efetivo_original?: number | null
          valor_manual_original?: number | null
        }
        Relationships: []
      }
      auditoria_pagamento_documentos: {
        Row: {
          id: string
          lancamento_id: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
          sha256: string
          enviado_por: string
          enviado_em: string
          status: string
          resumo_ia: string | null
          campos_extraidos: Json
          divergencias: Json
          snapshot_lancamento: Json
          modelo_ia: string | null
          modo_leitura: string | null
          erro: string | null
          revisado_por: string | null
          revisado_em: string | null
          revisao_observacao: string | null
        }
        Insert: {
          id?: string
          lancamento_id: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
          sha256: string
          enviado_por: string
          enviado_em?: string
          status?: string
          resumo_ia?: string | null
          campos_extraidos?: Json
          divergencias?: Json
          snapshot_lancamento?: Json
          modelo_ia?: string | null
          modo_leitura?: string | null
          erro?: string | null
          revisado_por?: string | null
          revisado_em?: string | null
          revisao_observacao?: string | null
        }
        Update: {
          id?: string
          lancamento_id?: string
          nome_arquivo?: string
          storage_path?: string
          tamanho_bytes?: number
          sha256?: string
          enviado_por?: string
          enviado_em?: string
          status?: string
          resumo_ia?: string | null
          campos_extraidos?: Json
          divergencias?: Json
          snapshot_lancamento?: Json
          modelo_ia?: string | null
          modo_leitura?: string | null
          erro?: string | null
          revisado_por?: string | null
          revisado_em?: string | null
          revisao_observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_pagamento_documentos_lancamento_id_fkey"
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
          ec_escolha_pendente: boolean
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
          origem_valor_atestado: string
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
          valor_atestado_automatico: number | null
          valor_atestado_manual: number | null
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
          ec_escolha_pendente?: boolean
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
          origem_valor_atestado?: string
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
          valor_atestado_automatico?: number | null
          valor_atestado_manual?: number | null
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
          ec_escolha_pendente?: boolean
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
          origem_valor_atestado?: string
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
          valor_atestado_automatico?: number | null
          valor_atestado_manual?: number | null
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
          piso_competencia_id: string | null
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
          piso_competencia_id?: string | null
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
          piso_competencia_id?: string | null
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
          exercicio_referencia: number
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
          tipo_parcela: string
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
          exercicio_referencia: number
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
          tipo_parcela?: string
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
          exercicio_referencia?: number
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
          tipo_parcela?: string
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
          lancamento_id: string | null
          marco: string
          prestacao_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lancamento_id?: string | null
          marco: string
          prestacao_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lancamento_id?: string | null
          marco?: string
          prestacao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prestacao_prazo_avisos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestacao_prazo_avisos_prestacao_id_fkey"
            columns: ["prestacao_id"]
            isOneToOne: false
            referencedRelation: "prestacoes_contas"
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
          lancamento_id: string | null
          link_manifestacao_cgm_sei: string | null
          link_parecer_ses_sei: string | null
          link_prestacao_sei: string | null
          link_relatorio_analise_sei: string | null
          numero_processo_pc: string | null
          observacao: string | null
          parecer: string | null
          pvh_data_limite: string | null
          pvh_pagamento_id: string | null
          pvh_prazo_dias: number | null
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
          lancamento_id?: string | null
          link_manifestacao_cgm_sei?: string | null
          link_parecer_ses_sei?: string | null
          link_prestacao_sei?: string | null
          link_relatorio_analise_sei?: string | null
          numero_processo_pc?: string | null
          observacao?: string | null
          parecer?: string | null
          pvh_data_limite?: string | null
          pvh_pagamento_id?: string | null
          pvh_prazo_dias?: number | null
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
          lancamento_id?: string | null
          link_manifestacao_cgm_sei?: string | null
          link_parecer_ses_sei?: string | null
          link_prestacao_sei?: string | null
          link_relatorio_analise_sei?: string | null
          numero_processo_pc?: string | null
          observacao?: string | null
          parecer?: string | null
          pvh_data_limite?: string | null
          pvh_pagamento_id?: string | null
          pvh_prazo_dias?: number | null
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
            foreignKeyName: "prestacoes_contas_pvh_pagamento_id_fkey"
            columns: ["pvh_pagamento_id"]
            isOneToOne: false
            referencedRelation: "pvh_pagamentos"
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
      pvh_documento_assinaturas: {
        Row: {
          assinado_em: string
          assinante_nome: string
          cargo: string | null
          codigo_sei: string | null
          created_at: string
          documento_id: string
          id: string
          motivo_revogacao: string | null
          papel_funcao: string
          registrado_por: string | null
          registrado_por_nome: string | null
          revogado_em: string | null
          revogado_por: string | null
          revogado_por_nome: string | null
          slot: string | null
          updated_at: string
        }
        Insert: {
          assinado_em?: string
          assinante_nome: string
          cargo?: string | null
          codigo_sei?: string | null
          created_at?: string
          documento_id: string
          id?: string
          motivo_revogacao?: string | null
          papel_funcao: string
          registrado_por?: string | null
          registrado_por_nome?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          revogado_por_nome?: string | null
          slot?: string | null
          updated_at?: string
        }
        Update: {
          assinado_em?: string
          assinante_nome?: string
          cargo?: string | null
          codigo_sei?: string | null
          created_at?: string
          documento_id?: string
          id?: string
          motivo_revogacao?: string | null
          papel_funcao?: string
          registrado_por?: string | null
          registrado_por_nome?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          revogado_por_nome?: string | null
          slot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvh_documento_assinaturas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "pvh_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_documento_tipos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          etapa: number
          exige_assinatura: boolean
          exige_data: boolean
          exige_link: boolean
          exige_numero: boolean
          exige_numero_sei: boolean
          ordem: number
          titulo: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          etapa: number
          exige_assinatura?: boolean
          exige_data?: boolean
          exige_link?: boolean
          exige_numero?: boolean
          exige_numero_sei?: boolean
          ordem?: number
          titulo: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          etapa?: number
          exige_assinatura?: boolean
          exige_data?: boolean
          exige_link?: boolean
          exige_numero?: boolean
          exige_numero_sei?: boolean
          ordem?: number
          titulo?: string
        }
        Relationships: []
      }
      pvh_documentos: {
        Row: {
          competencia_id: string
          created_at: string
          created_by: string | null
          dados: Json
          data_documento: string | null
          id: string
          link_documento: string | null
          normativa_referenciada_id: string | null
          numero: string | null
          numero_sei: string | null
          participante_id: string | null
          referencia_normativa_texto: string | null
          tipo_codigo: string
          updated_at: string
          updated_by: string | null
          updated_by_nome: string | null
        }
        Insert: {
          competencia_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          data_documento?: string | null
          id?: string
          link_documento?: string | null
          normativa_referenciada_id?: string | null
          numero?: string | null
          numero_sei?: string | null
          participante_id?: string | null
          referencia_normativa_texto?: string | null
          tipo_codigo: string
          updated_at?: string
          updated_by?: string | null
          updated_by_nome?: string | null
        }
        Update: {
          competencia_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          data_documento?: string | null
          id?: string
          link_documento?: string | null
          normativa_referenciada_id?: string | null
          numero?: string | null
          numero_sei?: string | null
          participante_id?: string | null
          referencia_normativa_texto?: string | null
          tipo_codigo?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pvh_documentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "pvh_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_documentos_normativa_referenciada_id_fkey"
            columns: ["normativa_referenciada_id"]
            isOneToOne: false
            referencedRelation: "pvh_normativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_documentos_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "pvh_participantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_documentos_tipo_codigo_fkey"
            columns: ["tipo_codigo"]
            isOneToOne: false
            referencedRelation: "pvh_documento_tipos"
            referencedColumns: ["codigo"]
          },
        ]
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
      pvh_empenho_solicitacao_assinaturas: {
        Row: {
          assinado_em: string
          assinado_por: string | null
          assinado_por_nome: string | null
          cargo: string | null
          codigo_sei: string | null
          created_at: string
          empenho_id: string
          id: string
          motivo_revogacao: string | null
          revogado_em: string | null
          revogado_por: string | null
          revogado_por_nome: string | null
          servidor_nome: string
          slot: string
          updated_at: string
        }
        Insert: {
          assinado_em?: string
          assinado_por?: string | null
          assinado_por_nome?: string | null
          cargo?: string | null
          codigo_sei?: string | null
          created_at?: string
          empenho_id: string
          id?: string
          motivo_revogacao?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          revogado_por_nome?: string | null
          servidor_nome: string
          slot: string
          updated_at?: string
        }
        Update: {
          assinado_em?: string
          assinado_por?: string | null
          assinado_por_nome?: string | null
          cargo?: string | null
          codigo_sei?: string | null
          created_at?: string
          empenho_id?: string
          id?: string
          motivo_revogacao?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          revogado_por_nome?: string | null
          servidor_nome?: string
          slot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvh_empenho_solicitacao_assinaturas_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "pvh_empenhos"
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
          numero_ne: string | null
          observacao: string | null
          prestador_id: string
          processo_anual_id: string | null
          solicitacao_competencia_id: string | null
          solicitacao_data: string | null
          solicitacao_enviada_aco: boolean
          solicitacao_enviada_aco_em: string | null
          solicitacao_enviada_aco_por: string | null
          solicitacao_enviada_aco_por_nome: string | null
          solicitacao_enviada_em: string | null
          solicitacao_enviada_por: string | null
          solicitacao_enviada_por_nome: string | null
          solicitacao_enviada_sefaz: boolean
          solicitacao_sei_link: string | null
          solicitacao_sei_numero: string | null
          status: string
          updated_at: string
          valor_total: number | null
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
          numero_ne?: string | null
          observacao?: string | null
          prestador_id: string
          processo_anual_id?: string | null
          solicitacao_competencia_id?: string | null
          solicitacao_data?: string | null
          solicitacao_enviada_aco?: boolean
          solicitacao_enviada_aco_em?: string | null
          solicitacao_enviada_aco_por?: string | null
          solicitacao_enviada_aco_por_nome?: string | null
          solicitacao_enviada_em?: string | null
          solicitacao_enviada_por?: string | null
          solicitacao_enviada_por_nome?: string | null
          solicitacao_enviada_sefaz?: boolean
          solicitacao_sei_link?: string | null
          solicitacao_sei_numero?: string | null
          status?: string
          updated_at?: string
          valor_total?: number | null
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
          numero_ne?: string | null
          observacao?: string | null
          prestador_id?: string
          processo_anual_id?: string | null
          solicitacao_competencia_id?: string | null
          solicitacao_data?: string | null
          solicitacao_enviada_aco?: boolean
          solicitacao_enviada_aco_em?: string | null
          solicitacao_enviada_aco_por?: string | null
          solicitacao_enviada_aco_por_nome?: string | null
          solicitacao_enviada_em?: string | null
          solicitacao_enviada_por?: string | null
          solicitacao_enviada_por_nome?: string | null
          solicitacao_enviada_sefaz?: boolean
          solicitacao_sei_link?: string | null
          solicitacao_sei_numero?: string | null
          status?: string
          updated_at?: string
          valor_total?: number | null
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
          {
            foreignKeyName: "pvh_empenhos_solicitacao_competencia_id_fkey"
            columns: ["solicitacao_competencia_id"]
            isOneToOne: false
            referencedRelation: "pvh_competencias"
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
      pvh_notificacoes_email: {
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
            foreignKeyName: "pvh_notificacoes_email_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "pvh_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_notificacoes_email_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: true
            referencedRelation: "pvh_participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pvh_pagamentos: {
        Row: {
          competencia_id: string
          comprovante_sei_link: string | null
          comprovante_sei_numero: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          data_programacao: string | null
          id: string
          participante_id: string
          programacao_sei_link: string | null
          programacao_sei_numero: string | null
          updated_at: string
          valor_pago: number | null
        }
        Insert: {
          competencia_id: string
          comprovante_sei_link?: string | null
          comprovante_sei_numero?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_programacao?: string | null
          id?: string
          participante_id: string
          programacao_sei_link?: string | null
          programacao_sei_numero?: string | null
          updated_at?: string
          valor_pago?: number | null
        }
        Update: {
          competencia_id?: string
          comprovante_sei_link?: string | null
          comprovante_sei_numero?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_programacao?: string | null
          id?: string
          participante_id?: string
          programacao_sei_link?: string | null
          programacao_sei_numero?: string | null
          updated_at?: string
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pvh_pagamentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "pvh_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvh_pagamentos_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "pvh_participantes"
            referencedColumns: ["id"]
          },
        ]
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
      pvh_subempenho_assinaturas: {
        Row: {
          assinado_em: string
          assinante_nome: string
          cargo: string
          codigo_sei: string | null
          created_at: string
          documento_tipo: string
          id: string
          motivo_revogacao: string | null
          registrado_por: string | null
          registrado_por_nome: string | null
          revogado_em: string | null
          revogado_por: string | null
          revogado_por_nome: string | null
          slot: string
          subempenho_id: string
          updated_at: string
        }
        Insert: {
          assinado_em?: string
          assinante_nome: string
          cargo: string
          codigo_sei?: string | null
          created_at?: string
          documento_tipo: string
          id?: string
          motivo_revogacao?: string | null
          registrado_por?: string | null
          registrado_por_nome?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          revogado_por_nome?: string | null
          slot: string
          subempenho_id: string
          updated_at?: string
        }
        Update: {
          assinado_em?: string
          assinante_nome?: string
          cargo?: string
          codigo_sei?: string | null
          created_at?: string
          documento_tipo?: string
          id?: string
          motivo_revogacao?: string | null
          registrado_por?: string | null
          registrado_por_nome?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          revogado_por_nome?: string | null
          slot?: string
          subempenho_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvh_subempenho_assinaturas_subempenho_id_fkey"
            columns: ["subempenho_id"]
            isOneToOne: false
            referencedRelation: "pvh_subempenhos"
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
          movimento_liquidacao_encaminhado_em: string | null
          movimento_liquidacao_encaminhado_por: string | null
          movimento_liquidacao_encaminhado_por_nome: string | null
          movimento_liquidacao_encaminhado_sefaz: boolean
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
          movimento_liquidacao_encaminhado_em?: string | null
          movimento_liquidacao_encaminhado_por?: string | null
          movimento_liquidacao_encaminhado_por_nome?: string | null
          movimento_liquidacao_encaminhado_sefaz?: boolean
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
          movimento_liquidacao_encaminhado_em?: string | null
          movimento_liquidacao_encaminhado_por?: string | null
          movimento_liquidacao_encaminhado_por_nome?: string | null
          movimento_liquidacao_encaminhado_sefaz?: boolean
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
      ec_aplicar_integracao: {
        Args: {
          p_confirmo: boolean
          p_proposta: string
          p_valor_anterior: number
        }
        Returns: number
      }
      ec_arquivar_competencia: {
        Args: { p_comp: string; p_motivo: string }
        Returns: undefined
      }
      ec_atesto_escolher_fonte: {
        Args: {
          p_lanc: string
          p_motivo: string
          p_origem: string
          p_sei: string
          p_valor_anterior: number
        }
        Returns: number
      }
      ec_atualizar_observacao_competencia: {
        Args: { p_comp: string; p_motivo: string; p_observacao: string }
        Returns: undefined
      }
      ec_cancelar_proposta: {
        Args: { p_justificativa: string; p_proposta: string }
        Returns: undefined
      }
      ec_checklist_fechamento: { Args: { p_comp: string }; Returns: Json }
      ec_com_assinatura: {
        Args: { p_comp: string; p_ref: string; p_tipo: string }
        Returns: string
      }
      ec_com_marcar_envio: {
        Args: {
          p_assunto: string
          p_corpo: string
          p_ids: string[]
          p_protocolo: string
        }
        Returns: number
      }
      ec_com_reabrir: {
        Args: { p_id: string; p_motivo: string }
        Returns: number
      }
      ec_com_rotear: {
        Args: {
          p_comp: string
          p_destino: string
          p_motivo: string
          p_ref: string
          p_tipo: string
        }
        Returns: string
      }
      ec_conferir_item: { Args: { p_item: string }; Returns: undefined }
      ec_confirmar_limpeza_teste: {
        Args: { p_comp: string }
        Returns: undefined
      }
      ec_criar_competencia_vinculada: {
        Args: {
          p_cnes?: string
          p_convenio: string
          p_lanc: string
          p_prest: string
        }
        Returns: string
      }
      ec_decidir_item: {
        Args: {
          p_decisao: string
          p_item: string
          p_justificativa: string
          p_motivo_revisao?: string
          p_versao: number
        }
        Returns: number
      }
      ec_editar_competencia: {
        Args: {
          p_cnes: string
          p_comp: string
          p_convenio: string
          p_lanc: string
          p_motivo: string
          p_observacao: string
          p_prest: string
        }
        Returns: undefined
      }
      ec_encerrar: { Args: { p_comp: string }; Returns: number }
      ec_encerrar_seguro: {
        Args: {
          p_comp: string
          p_confirmo: boolean
          p_execucao: string
          p_justificativa: string
          p_sei: string
        }
        Returns: number
      }
      ec_excluir_competencia: {
        Args: { p_comp: string; p_motivo: string }
        Returns: undefined
      }
      ec_excluir_competencia_teste: {
        Args: { p_comp: string; p_confirmacao: string; p_motivo: string }
        Returns: Json
      }
      ec_fase5_autorizar: { Args: { p_comp: string }; Returns: undefined }
      ec_fase8_autorizar: {
        Args: {
          p_documento_sei: string
          p_justificativa: string
          p_prestador: string
        }
        Returns: undefined
      }
      ec_fase8_prontidao: { Args: { p_prestador: string }; Returns: Json }
      ec_fase8_registrar: {
        Args: {
          p_comp: string
          p_declaracao: boolean
          p_documento_sei: string
          p_financeiras: number
          p_funcionais: number
          p_html_sha: string
          p_justificativa: string
          p_manifesto_sha: string
          p_perfil: string
          p_react_sha: string
          p_verificacoes: Json
        }
        Returns: string
      }
      ec_fase8_revogar: {
        Args: { p_motivo: string; p_prestador: string }
        Returns: undefined
      }
      ec_fase8_verificacoes_ok: { Args: { p: Json }; Returns: boolean }
      ec_fpo_iniciar: {
        Args: {
          p_aih: string
          p_item: string
          p_justificativa: string
          p_valor: number
        }
        Returns: string
      }
      ec_fpo_mudar_etapa: {
        Args: {
          p_documento_sei: string
          p_etapa: number
          p_fluxo: string
          p_justificativa: string
          p_versao: number
        }
        Returns: number
      }
      ec_fpo_vincular_correcao: {
        Args: { p_correcao: string; p_fluxo: string; p_justificativa: string }
        Returns: undefined
      }
      ec_gerar_snapshot_fechamento: {
        Args: { p_comp: string }
        Returns: undefined
      }
      ec_importar_itens_local: {
        Args: {
          p_comp: string
          p_evidencias: Json
          p_itens: Json
          p_motor_versao: string
        }
        Returns: number
      }
      ec_importar_itens_processados: {
        Args: { p_arquivos: string[]; p_comp: string; p_itens: Json }
        Returns: number
      }
      ec_importar_itens_v2: {
        Args: {
          p_comp: string
          p_evidencias: Json
          p_itens: Json
          p_motor_versao: string
        }
        Returns: number
      }
      ec_incluir_correcao: {
        Args: {
          p_aihs: string[]
          p_comp: string
          p_fonte: string
          p_motivo: string
          p_origem: string
          p_referencia: string
          p_sei: string
          p_valor: number
        }
        Returns: string
      }
      ec_listar_lancamentos_disponiveis: {
        Args: never
        Returns: {
          cnes_sugerido: string
          competencia: string
          convenio_id: string
          descricao: string
          lancamento_id: string
          nome_instituicao: string
          objeto: string
          parcela: string
          prestador_id: string
          valor_atestado: number
        }[]
      }
      ec_listar_parcelas_encontro: {
        Args: never
        Returns: {
          cnes_institucional: string
          competencia: string
          convenio_id: string
          descricao: string
          encontro_id: string
          encontro_lancamento_id: string
          encontro_status: string
          lancamento_id: string
          nome_instituicao: string
          objeto: string
          parcela: string
          prestador_id: string
          valor_atestado: number
        }[]
      }
      ec_norma_cib_competencia: {
        Args: { p_competencia: string }
        Returns: string
      }
      ec_propor_integracao: {
        Args: {
          p_comp: string
          p_confirmo: boolean
          p_justificativa: string
          p_lancamento: string
          p_sei: string
          p_valor_anterior: number
        }
        Returns: string
      }
      ec_reabrir_controlado: {
        Args: { p_comp: string; p_motivo: string; p_sei: string }
        Returns: undefined
      }
      ec_restaurar_competencia: {
        Args: { p_comp: string; p_motivo: string }
        Returns: undefined
      }
      ec_resumo: { Args: { p_comp: string }; Returns: Json }
      ec_resumo_financeiro: { Args: { p_comp: string }; Returns: Json }
      ec_revisar_correcao: {
        Args: { p_id: string; p_justificativa: string; p_status: string }
        Returns: undefined
      }
      ec_validar_execucao_local: {
        Args: { p_comp: string }
        Returns: undefined
      }
      ec_validar_lancamento_elegivel: {
        Args: { p_convenio: string; p_lanc: string; p_prest: string }
        Returns: string
      }
      ec_valor_item: {
        Args: {
          p_categoria: string
          p_decisao: string
          p_esperado: number
          p_publicado: number
          p_situacao: string
        }
        Returns: number
      }
      ec_valor_item_documentado: {
        Args: {
          p_categoria: string
          p_decisao: string
          p_detalhe: Json
          p_esperado: number
          p_publicado: number
          p_situacao: string
        }
        Returns: number
      }
      ec_vincular_lancamento: {
        Args: {
          p_comp: string
          p_convenio: string
          p_justificativa: string
          p_lancamento: string
        }
        Returns: undefined
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
      piso_aplicar_memoria_13_cnes: {
        Args: {
          p_arquivo: string
          p_autor: string
          p_competencia: string
          p_linhas: Json
        }
        Returns: number
      }
      piso_etapa_doc: { Args: { p_tipo: string }; Returns: number }
      piso_marcar_reconferencia: {
        Args: { p_comp: string; p_etapa: number }
        Returns: undefined
      }
      piso13_confirmar_calculo_cnes: {
        Args: { p_competencia: string }
        Returns: number
      }
      pvh_alocar_saldo_empenho: {
        Args: { p_empenho: string; p_participante: string }
        Returns: number
      }
      pvh_assinaturas_obrigatorias_empenho_ok: {
        Args: { p_empenho: string }
        Returns: boolean
      }
      pvh_concluir_etapa2: { Args: { p_comp: string }; Returns: undefined }
      pvh_concluir_etapa3: { Args: { p_comp: string }; Returns: undefined }
      pvh_concluir_etapa4: { Args: { p_comp: string }; Returns: undefined }
      pvh_concluir_etapa5: { Args: { p_comp: string }; Returns: undefined }
      pvh_concluir_etapa6: { Args: { p_comp: string }; Returns: undefined }
      pvh_confirmar_envio_solicitacao_aco: {
        Args: { p_empenho: string }
        Returns: undefined
      }
      pvh_confirmar_envio_solicitacao_empenho: {
        Args: { p_empenho: string }
        Returns: undefined
      }
      pvh_confirmar_movimento_liquidacao_sefaz: {
        Args: { p_subempenho: string }
        Returns: undefined
      }
      pvh_encerrar_competencia: {
        Args: { p_comp: string; p_conferido?: boolean }
        Returns: undefined
      }
      pvh_excluir_competencia: { Args: { p_comp: string }; Returns: undefined }
      pvh_excluir_empenho_orfao: {
        Args: { p_empenho: string }
        Returns: undefined
      }
      pvh_excluir_fluxo_empenho: {
        Args: { p_comp: string; p_empenho: string }
        Returns: undefined
      }
      pvh_marcar_reconferencia: {
        Args: { p_comp: string; p_etapa: number }
        Returns: undefined
      }
      pvh_preparar_etapa4: { Args: { p_comp: string }; Returns: undefined }
      pvh_reabrir_competencia: {
        Args: { p_comp: string; p_motivo: string }
        Returns: undefined
      }
      pvh_rebalancear_alocacoes_origem: {
        Args: { p_participante: string }
        Returns: undefined
      }
      pvh_reconferir_etapa2_por_comp: {
        Args: { p_comp: string }
        Returns: undefined
      }
      pvh_registrar_nota_empenho: {
        Args: {
          p_empenho: string
          p_link_sei: string
          p_numero_ne: string
          p_numero_sei: string
          p_participante: string
          p_valor_total: number
        }
        Returns: number
      }
      pvh_verificar_prazos_prestacao: { Args: never; Returns: number }
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
