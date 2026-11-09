# PACTO / PVH — cópia lógica independente ANTES de aplicar a Fase A.
# Executar LOCALMENTE no Windows, fora do editor SQL do Lovable.
# Requer pg_dump e pg_restore do PostgreSQL e a variável PACTO_DB_URL
# configurada de forma privada (não inserir credenciais neste arquivo).
# A validação completa exige restaurar em uma instância isolada.
param([string]$Pasta = (Join-Path $HOME "Documents\PACTO-Backups\PVH"))
$ErrorActionPreference = "Stop"

if (-not $env:PACTO_DB_URL) {
  throw "Defina PACTO_DB_URL com a conexão autenticada do banco, sem publicar credenciais."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "Instale as ferramentas PostgreSQL (pg_dump/pg_restore) antes de executar."
}
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
  throw "pg_restore não encontrado."
}

New-Item -ItemType Directory -Path $Pasta -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$arquivo = Join-Path $Pasta "PACTO-PVH-pre-faseA-$stamp.dump"
$lista = Join-Path $Pasta "PACTO-PVH-pre-faseA-$stamp.toc.txt"
$hash = Join-Path $Pasta "PACTO-PVH-pre-faseA-$stamp.sha256.txt"

& pg_dump --dbname="$env:PACTO_DB_URL" --format=custom --no-owner --no-acl --file="$arquivo"
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $arquivo -Force -ErrorAction SilentlyContinue
  throw "pg_dump falhou. Nenhum backup válido foi criado."
}
& pg_restore --list "$arquivo" | Set-Content -LiteralPath $lista -Encoding UTF8
if ($LASTEXITCODE -ne 0) {
  throw "Arquivo gerado, mas pg_restore não conseguiu ler o catálogo. Não implantar."
}
$sha = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash
"SHA256 $sha  $([IO.Path]::GetFileName($arquivo))" |
  Set-Content -LiteralPath $hash -Encoding UTF8

Write-Host "Backup criado e catálogo legível: $arquivo"
Write-Host "SHA-256 registrado em: $hash"
Write-Host "ATENÇÃO: validação de restauração em banco isolado ainda é obrigatória."
Write-Host "Não envie este arquivo ao GitHub; ele pode conter dados pessoais/institucionais."
