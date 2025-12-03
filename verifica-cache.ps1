Write-Host "🔍 VERIFICAÇÃO FINAL DO CACHE" -ForegroundColor Magenta
Write-Host "=============================="

# 1. Status dos containers
Write-Host "`n1. 🐳 Containers:" -ForegroundColor Yellow
docker ps --format "table {{.Names}}\t{{.Status}}"

# 2. Redis funcionando?
Write-Host "`n2. 🔗 Redis:" -ForegroundColor Yellow
$redisTest = docker exec redis-pweb redis-cli ping 2>&1
if ($redisTest -eq "PONG") {
    Write-Host "   ✅ Conectado" -ForegroundColor Green
} else {
    Write-Host "   ❌ Falha: $redisTest" -ForegroundColor Red
    exit 1
}

# 3. Ver chaves Redis
Write-Host "`n3. 🔑 Chaves Redis:" -ForegroundColor Yellow
docker exec redis-pweb redis-cli keys "*"

# 4. Backend funcionando?
Write-Host "`n4. 🌐 API Backend:" -ForegroundColor Yellow
try {
    $apiTest = Invoke-RestMethod -Uri "http://localhost:3000/" -Method Get
    Write-Host "   ✅ Online: $($apiTest.message)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ API offline" -ForegroundColor Red
}

# 5. Fazer teste de cache
Write-Host "`n5. 🧪 Executando teste de cache..." -ForegroundColor Yellow
Write-Host "   🔄 GET 1..." -NoNewline
$time1 = Measure-Command { Invoke-RestMethod -Uri "http://localhost:3000/tasks" -Method Get } | Select-Object -ExpandProperty TotalMilliseconds
Write-Host " $([math]::Round($time1))ms"

Write-Host "   🔄 GET 2 (cache)..." -NoNewline  
$time2 = Measure-Command { Invoke-RestMethod -Uri "http://localhost:3000/tasks" -Method Get } | Select-Object -ExpandProperty TotalMilliseconds
Write-Host " $([math]::Round($time2))ms"

if ($time2 -lt $time1) {
    Write-Host "   ✅ Cache funcionando (mais rápido)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Cache pode não estar ativo" -ForegroundColor Yellow
}

# 6. Logs recentes
Write-Host "`n6. 📝 Últimos logs do backend:" -ForegroundColor Yellow
docker-compose logs backend-pweb --tail=20 | Select-String "CACHE|Redis" -CaseSensitive:$false

Write-Host "`n🎯 CONCLUSÃO:" -ForegroundColor Cyan
Write-Host "=============="
Write-Host "Se você ver nos logs:" -ForegroundColor White
Write-Host "   'CACHE MISS' → Primeira requisição" -ForegroundColor Gray
Write-Host "   'CACHE HIT' → Segunda requisição" -ForegroundColor Gray  
Write-Host "   'Cache limpo' → Após criar task" -ForegroundColor Gray
Write-Host "`n✅ Então o cache está FUNCIONANDO!" -ForegroundColor Green
Write-Host "`n🌐 Acesse o frontend: http://localhost" -ForegroundColor Blue