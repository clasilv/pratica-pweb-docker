#!/bin/sh
set -e

echo "Aguardando banco de dados ficar pronto..."
# Aguarda alguns segundos para garantir que o banco está pronto
sleep 3

# Conecta ao banco postgres padrão e cria o banco se não existir
DB_NAME_VALUE=${DB_NAME:-todolist}
DB_HOST_VALUE=${DB_HOST:-db}
DB_PORT_VALUE=${DB_PORT:-5432}
DB_USER_VALUE=${DB_USER:-postgres}
DB_PASSWORD_VALUE=${DB_PASSWORD:-postgres}

echo "Verificando se o banco de dados '${DB_NAME_VALUE}' existe..."
export PGPASSWORD=${DB_PASSWORD_VALUE}

# Aguarda o PostgreSQL estar totalmente pronto (até 30 tentativas)
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
  if psql -h ${DB_HOST_VALUE} -p ${DB_PORT_VALUE} -U ${DB_USER_VALUE} -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "PostgreSQL está pronto!"
    break
  fi
  attempt=$((attempt + 1))
  echo "Tentativa $attempt/$max_attempts: aguardando PostgreSQL..."
  sleep 2
done

if [ $attempt -eq $max_attempts ]; then
  echo "✗ ERRO: Não foi possível conectar ao PostgreSQL após $max_attempts tentativas"
  exit 1
fi

# Verifica se o banco existe (case-sensitive)
DB_EXISTS=$(psql -h ${DB_HOST_VALUE} -p ${DB_PORT_VALUE} -U ${DB_USER_VALUE} -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME_VALUE}';" 2>/dev/null | xargs)

if [ "$DB_EXISTS" != "1" ]; then
  echo "Banco de dados '${DB_NAME_VALUE}' não existe. Criando..."
  psql -h ${DB_HOST_VALUE} -p ${DB_PORT_VALUE} -U ${DB_USER_VALUE} -d postgres -c \
    "CREATE DATABASE \"${DB_NAME_VALUE}\";" 2>&1
  CREATE_RESULT=$?
  if [ $CREATE_RESULT -eq 0 ]; then
    echo "✓ Banco de dados '${DB_NAME_VALUE}' criado com sucesso!"
  else
    echo "✗ ERRO: Falha ao criar banco de dados (código: $CREATE_RESULT)"
    echo "Tentando verificar novamente..."
    sleep 2
    DB_EXISTS_AFTER=$(psql -h ${DB_HOST_VALUE} -p ${DB_PORT_VALUE} -U ${DB_USER_VALUE} -d postgres -tc \
      "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME_VALUE}';" 2>/dev/null | xargs)
    if [ "$DB_EXISTS_AFTER" = "1" ]; then
      echo "✓ Banco de dados '${DB_NAME_VALUE}' existe agora!"
    else
      echo "✗ ERRO: Banco de dados ainda não existe após tentativa de criação"
      exit 1
    fi
  fi
else
  echo "✓ Banco de dados '${DB_NAME_VALUE}' já existe"
fi

unset PGPASSWORD

echo "Executando migrations..."
NODE_ENV=${NODE_ENV:-development} npx sequelize-cli db:migrate

if [ $? -eq 0 ]; then
  echo "✓ Migrations executadas com sucesso!"
else
  echo "✗ ERRO: Falha ao executar migrations"
  exit 1
fi

echo "Iniciando servidor..."
exec node server.js