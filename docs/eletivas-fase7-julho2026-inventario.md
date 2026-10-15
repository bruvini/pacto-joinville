# Encontro de Contas HMSJ — inventário preliminar 07/2026

Inventário **somente de estrutura e integridade** de 15 arquivos da Biblioteca do usuário, lidos em ambiente de trabalho isolado em 15/10/2026. Não inclui dados nominativos, procedimentos nem valores individuais.

Não é um golden master, não demonstra que esses arquivos são a versão escolhida no manifesto **real** do Lovable e não equivale à conferência contábil por centavos. Compare os hashes abaixo com o manifesto da execução no aplicativo antes de importar um golden.

| Arquivo original | Papel candidato | SHA-256 integral | Estrutura observada |
| --- | --- | --- | --- |
| SIH_FAEC_07(1).dbf | `dbf_faec` | `edc2e12fd7833812d54ac18b302a23b6090e9cc688fa21d41124af0e2d73d255` | 10.608 bytes / 115 registros |
| SIH_MAC_07(1).dbf | `dbf_mac` | `c8959276d7fb1d904919ee3278bffddba717abac94f4eb4b7a922a32761cd446` | 7.810 bytes / 119 registros |
| SIA_07(1).dbf | `dbf_sia` | `b0359fc4b3bfcdd83dc9d607a1c13668238085ecbb396bce565b3ec6cabd6044` | 265.410 bytes / 8.290 registros |
| SIH FAEC Julho 2026(2).xlsx | `s_faec` | `8c3a920a53bfdc83ad7399a2968dd31cce3df920abf9028268505e4adc9d9435` | Físico, Financeiro, Complemento |
| SIH FAEC Múltiplas e Sequênciais Julho 2026(1).xlsx | `s_faec_ms` | `54e30d5a80a398419e77b640f6ef66d604c0595343f643a9c1f35b43cb30d5ce` | Mult e Seq, Hospital, Procedimentos |
| SIH FAEC com prêmio Estadual Julho 2026(1).xlsx | `s_faec_est` | `ee300836c76a3fba5b49325a3b8cf5a5df3c37f83ef091280f49c65b7273e64b` | Físico, Complemento |
| SIH FAEC com Faixa Estadual Julho 2026(1).xlsx | `s_mac_faec` | `870f7890b3c847df751fbfb0420763d06f89841568bdf8f827d1e1bea7606308` | Físico, Complemento |
| SIH MAC Julho 2026(1).xlsx | `s_mac` | `a22bd3ba9703525d5bb9dabb04a092f097b7f73ca36badded38dbbd7c93bc9dd` | Físico, Financeiro, Complemento |
| SIH MAC Múltiplas e Sequênciais Julho 2026(1).xlsx | `s_mac_ms` | `15e1d4c6fdf2681250c838879039a5559bd695c19e63f0b43166ccd05cefcbb5` | Físico Principal, Físico Secundário, Complemento |
| SIH MAC com prêmio Federal Julho 2026(1).xlsx | `s_mac_fed` | `eb629dc4ba56093b92e53645a213ef87002f030aa87dad3a8aac1204f56cfd9d` | Físico, Complemento |
| SIA FAEC Julho 2026(2).xlsx | `sia_faec` | `046839e41584f92c135efe94ce9098f907d3a48ff735238456d0368b1626cdf5` | Físico, Financeiro, Complemento |
| SIA FAEC Puro Julho 2026(1).xlsx | `sia_faec_p` | `110b20d43a317f3b3c86f4b1d2a7991dd3e74a442dde243aa2b292a5ac04ee21` | Físico, Complemento |
| SIA MAC Julho 2026(1).xlsx | `sia_mac` | `3c1d2e86e42d1d199dd081efa405b5230b9f3d49abb84f86e9b2c4de84c0c7b4` | Físico, Financeiro, Complemento |
| EC Deliberações Julho 2026(1).xlsx | `ec_delib` | `ff0c575c7ef10a90198fe10916bab6ad980ff437e52bbabb0f894033acdef34b` | Delib_* |
| HMSJ- AIH 07_2026(1).xlsx | `wb_aih` | `3bddb968d3a59efa5ca01a84e8f7fbb98d048c2a38f8a31969544c119b640be8` | Original para Consultas, 727CIB2025 |

As 15 fontes foram reconhecidas como bytes de DBF/XLSX e tiveram seus tamanhos/assinaturas SHA-256 calculados. Abertura ZIP de workbook e cabeçalhos de DBF foi verificada sem processar dados de paciente. Layout de cada aba/célula, elegibilidade CNES, números de AIH/QT, decisões, vigência e valores **ainda exigem execução real** do motor e comparação com a evidência congelada no banco.

O arquivo `s_mac_ms` de julho contém as abas **Físico Principal, Físico Secundário e Complemento**; para abril o modelo precedente não exige necessariamente esse papel. Os arquivos de agosto/FPO efetiva não compõem este inventário.

**Resultado deste inventário:** presença física/identificação estrutural dos 15 arquivos: *conferido*. Valores, decisões e totais: *pendente de golden original vs React e SQL/RLS*.
