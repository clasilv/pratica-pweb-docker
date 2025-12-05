# Use a imagem oficial do Node.js como base
FROM node:18-alpine

# Instala o bash e postgresql-client para executar scripts e comandos SQL
RUN apk add --no-cache bash postgresql-client

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências (incluindo devDependencies para sequelize-cli)
RUN npm ci

# Copia o código fonte da aplicação
COPY . .

# Corrige quebras de linha do Windows (COM VALIDAÇÃO)
RUN if [ -f "start.sh" ]; then \
    sed -i 's/\r$//' start.sh && \
    chmod +x start.sh && \
    echo "✓ start.sh corrigido e com permissão de execução"; \
  else \
    echo "⚠️ Arquivo start.sh não encontrado, continuando..."; \
  fi

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Define variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Comando para iniciar a aplicação (executa migrations e inicia servidor)
CMD ["./start.sh"]