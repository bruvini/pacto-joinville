# Piso — crédito documental na Portaria municipal

- A Portaria municipal (chave 3) e a Confirmação do recurso no FMS (chave 4) são etapas visuais próprias. A confirmação do crédito continua condicionada à conclusão documental dos atos municipais, sem impor ordem cronológica às suas datas.
- Não há renumeração de identificadores persistidos, inclusive 7A (chave 10), tampouco alteração de registros encerrados.
- Mensal: nove etapas visuais; 13ª: oito. A preparação orçamentária permanece paralela.
- A confirmação do crédito exige data, valor, identificação e link SEI e justificativa da diferença quando aplicável. Crédito anterior à publicação municipal é aceito.
- O número SEI tem campo próprio, com apresentação legada extraída da referência textual quando disponível. Seu preenchimento não modifica a referência original.
- A conciliação bancária da AFC não é exibida na esteira operacional; dados históricos permanecem no banco e no relatório quando registrados: não presume disponibilidade, não libera recursos, preserva reservas, evidências e auditoria. Não bloqueia o encerramento operacional e não o reabre por edição da conciliação.
- Migration transacional aditiva quanto aos dados: nova coluna e alteração dos triggers específicos. Não realiza UPDATE de competências, reservas ou históricos. 
- A reversão exige restaurar as definições originais dos triggers da migration AFC e do trigger de link; conservar a coluna e os dados cadastrados. Não fechar ou reabrir competências como parte da implantação.

- Ajuste visual subsequente: valor publicado na mesma linha dos dados SEI da Portaria mensal; sem nova migration. Em eventual complemento, utilizar a etapa de empenho, atualmente com uma obrigação por instituição, sem presumir saldo disponível.
