# Estágio 1: Build da aplicação
FROM node:20-alpine AS builder

WORKDIR /app

# Argumento de build para URL da API
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências
RUN npm ci

# Copia o código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Estágio 2: Servir com Nginx
FROM nginx:alpine

# Copia os arquivos buildados para o nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copia a configuração customizada do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expõe a porta 80
EXPOSE 80

# Comando para iniciar o nginx
CMD ["nginx", "-g", "daemon off;"]
