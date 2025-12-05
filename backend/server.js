import express from "express";
import cors from "cors";
import { authenticate } from './src/middlewares/auth.js';
import supabase from './src/config/supabase.js';
import dotenv from "dotenv";
import Redis from "ioredis";
import bd from "./src/models/index.js";
import authRoutes from "./src/routes/auth.js";

dotenv.config();

const { Task } = bd;

// ========== CONFIGURAÇÃO REDIS (para cache) ==========
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-pweb',
  port: parseInt(process.env.REDIS_PORT) || 6379,
});

redis.on('connect', () => console.log("✅ Redis conectado (para cache)"));
redis.on('error', (err) => console.error("❌ Erro no Redis:", err.message));

// Testa a conexão com o banco de dados
try {
  await bd.sequelize.authenticate();
  console.log("✅ Conexão com o banco de dados estabelecida com sucesso.");
} catch (error) {
  console.error("❌ Erro ao conectar ao banco de dados:", error);
  process.exit(1);
}

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());
app.use("/", authRoutes);

// ========== IMPLEMENTAÇÃO DE CACHE (MISS/HIT) ==========
const cacheMiddleware = (prefix, ttl = 30) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const cacheKey = `${prefix}:${req.originalUrl}`;
    
    try {
      // 1. Verifica se tem no cache (CACHE HIT)
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`📦 CACHE HIT: ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }
      
      // 2. Se não tem (CACHE MISS)
      console.log(`❌ CACHE MISS: ${cacheKey}`);
      
      // Salva referência à função original
      const originalJson = res.json.bind(res);
      
      // Sobrescreve res.json
      res.json = function(data) {
        // Salva no cache de forma assíncrona (não-bloqueante)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.setex(cacheKey, ttl, JSON.stringify(data))
            .then(() => console.log(`💾 Cache salvo: ${cacheKey}`))
            .catch(err => console.log('⚠️ Erro ao salvar cache:', err.message));
        }
        
        // Retorna resposta normalmente
        return originalJson(data);
      };
      
      next();
    } catch (err) {
      console.log('⚠️ Erro no cache, continuando sem cache...', err.message);
      next();
    }
  };
};

// ========== INVALIDAÇÃO DO CACHE ==========
const clearTasksCache = async () => {
  try {
    const keys = await redis.keys('tasks:*');
    if (keys.length) {
      console.log(`🗑️ Cache invalidado (${keys.length} chaves):`, keys);
      await redis.del(keys);
      console.log(`✅ Cache limpo com sucesso`);
    } else {
      console.log(`ℹ️ Nenhuma chave de cache para invalidar`);
    }
  } catch (err) {
    console.log('⚠️ Erro ao invalidar cache:', err.message);
  }
};

// ========== ROTAS COM CACHE ==========
app.get("/", (req, res) => {
  res.json({ message: "API Todo List" });
});

// GET /tasks COM CACHE
app.get("/tasks", cacheMiddleware('tasks', 30), async (req, res) => {
  const tasks = await Task.findAll({ order: [['createdAt', 'DESC']] });
  res.json(tasks);
});

// GET /tasks/:id COM CACHE
app.get("/tasks/:id", cacheMiddleware('task', 60), async (req, res) => {
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
  res.json(task);
});

// ========== ROTAS QUE INVALIDAM CACHE ==========
app.post("/tasks", async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "Descrição obrigatória" });
  const task = await Task.create({ description, completed: false });
  
  // INVALIDAÇÃO DO CACHE após criação
  await clearTasksCache();
  
  res.status(201).json(task);
});

app.put("/tasks/:id", async (req, res) => {
  const { description, completed } = req.body;
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
  await task.update({ description, completed });
  
  // INVALIDAÇÃO DO CACHE após atualização
  await clearTasksCache();
  
  res.json(task);
});

app.delete("/tasks/:id", async (req, res) => {
  const deleted = await Task.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ error: "Tarefa não encontrada" });
  
  // INVALIDAÇÃO DO CACHE após exclusão
  await clearTasksCache();
  
  res.status(204).send();
});

// ========== ROTA /signin QUE FUNCIONA ==========
app.post('/signin', (req, res) => {
  console.log('ROTA /signin CHAMADA - FUNCIONANDO');
  return res.json({ 
    success: true, 
    message: 'Login endpoint funcionando',
    timestamp: new Date().toISOString()    
  });
});

// ========== ROTAS DE PERFIL ==========

// GET /profile - Obtém dados do usuário
app.get('/profile', async (req, res) => {
  try {
    console.log('📨 GET /profile chamado');
    
    // TEMPORÁRIO: Mock de usuário (depois seu colega implementa JWT)
    // Quando o middleware JWT estiver pronto, trocar por:
    // const userId = req.user.id;
    
    const mockUser = {
      id: 'user-123',
      name: 'Clara Silva',
      email: 'clara@exemplo.com',
      photo: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face'
    };
    
    res.json(mockUser);
    
  } catch (error) {
    console.error('❌ Erro no GET /profile:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.put('/profile', authenticate, async (req, res) => {
  try {
    console.log('📤 PUT /profile chamado por:', req.user.email);
    
    const { name, email, photoBase64 } = req.body;

    // Validação: pelo menos um campo para atualizar
    if (!name && !email && !photoBase64) {
      return res.status(400).json({ error: 'Nenhum dado para atualizar' });
    }

    let photoUrl = null;
    let updateData = {};

    // 1. PROCESSAR FOTO (se fornecida)
    if (photoBase64) {
      try {
        // Remove cabeçalho data:image/...;base64,
        const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Nome único do arquivo
        const fileName = `avatar_${req.user.id}_${Date.now()}.jpg`;
        
        // Upload para Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadError) {
          console.error('❌ Erro no upload Supabase:', uploadError);
          return res.status(500).json({ error: 'Falha ao enviar foto' });
        }

        // Pega URL pública
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        
        photoUrl = publicUrl;
        updateData.photo_url = photoUrl;
        console.log('✅ Foto enviada para Supabase:', photoUrl);
        
      } catch (uploadError) {
        console.error('❌ Erro no processamento da foto:', uploadError);
        return res.status(500).json({ error: 'Erro ao processar imagem' });
      }
    }

    // 2. ATUALIZAR OUTROS CAMPOS
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    // 3. RESPOSTA
    const updatedUser = {
      id: req.user.id,
      name: name || req.user.name,
      email: email || req.user.email,
      photo_url: photoUrl || null,
      message: photoBase64 ? 'Foto e perfil atualizados!' : 'Perfil atualizado!'
    };

    res.json(updatedUser);

  } catch (error) {
    console.error('❌ Erro no PUT /profile:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Database: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`🔗 Redis Cache: ${process.env.REDIS_HOST || 'redis-pweb'}:${process.env.REDIS_PORT || 6379}`);
});