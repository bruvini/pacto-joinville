# Piso — crédito documental na Portaria municipal

- A etapa visual de Portaria municipal reúne as chaves internas 3 (atos/documento) e 4 (crédito); apenas aparece concluída quando ambas estiverem completas e sem reconferência.
- Não há renumeração de identificadores persistidos, inclusive 7A (chave 10), tampouco alteração de registros encerrados.
- Mensal: oito etapas visuais; 13ª: sete. A preparação orçamentária permanece paralela.
- A confirmação do crédito exige data, valor, identificação e link SEI e justificativa da diferença quando aplicável. Crédito anterior à publicação municipal é aceito.
- O número SEI tem campo próprio, com apresentação legada extraída da referência textual quando disponível. Seu preenchimento não modifica a referência original.
- A conciliação bancária da AFC é complementar: não presume disponibilidade, não libera recursos, preserva reservas, evidências e auditoria. Não bloqueia o encerramento operacional e não o reabre por edição da conciliação.
- Migration transacional aditiva quanto aos dados: nova coluna e alteração dos triggers específicos. Não realiza UPDATE de competências, reservas ou históricos. 
- A reversão exige restaurar as definições originais dos triggers da migration AFC e do trigger de link; conservar a coluna e os dados cadastrados. Não fechar ou reabrir competências como parte da implantação.
