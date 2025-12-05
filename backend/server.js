import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Redis from "ioredis";
import bd from "./src/models/index.js";
import { authMiddleware } from "./src/middleware/authMiddleware.js";
import { authenticate } from './src/middlewares/auth.js';
import supabase from './src/config/supabase.js';

dotenv.config();

const { Task, User } = bd;

// Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-pweb',
  port: parseInt(process.env.REDIS_PORT) || 6379,
});

redis.on('connect', () => console.log("✅ Redis conectado"));
redis.on('error', (err) => console.error("❌ Redis erro:", err));

// Banco
try {
  await bd.sequelize.authenticate();
  console.log("✅ Banco OK");
} catch (error) {
  console.error("❌ Banco erro:", error);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cors());

// Cache middleware
const cacheMiddleware = (prefix, ttl = 30) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const cacheKey = `${prefix}:${req.originalUrl}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`📦 CACHE HIT: ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }
      
      console.log(`❌ CACHE MISS: ${cacheKey}`);
      
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.setex(cacheKey, ttl, JSON.stringify(data))
            .then(() => console.log(`💾 Cache salvo: ${cacheKey}`))
            .catch(err => console.log('⚠️ Erro cache:', err));
        }
        return originalJson(data);
      };
      
      next();
    } catch (err) {
      console.log('⚠️ Cache erro:', err.message);
      next();
    }
  };
};

const clearTasksCache = async () => {
  try {
    const keys = await redis.keys('tasks:*');
    if (keys.length) {
      console.log(`🗑️ Cache invalidado (${keys.length} chaves)`);
      await redis.del(keys);
    }
  } catch (err) {
    console.log('⚠️ Limpar cache erro:', err.message);
  }
};

// ============ ROTAS PÚBLICAS ============

app.get("/", (req, res) => {
  res.json({ 
    message: "API Todo List com Cache Redis e Supabase Storage",
    status: "online",
    auth: "habilitada",
    endpoints: {
      auth: {
        signin: "POST /signin",
        profile: "GET /profile (autenticado)"
      },
      tasks: {
        list: "GET /tasks (com cache)",
        create: "POST /tasks (autenticado)",
        update: "PUT/PATCH /tasks/:id (autenticado)",
        delete: "DELETE /tasks/:id (autenticado)"
      },
      profile: {
        get: "GET /profile (autenticado)",
        update: "PUT /profile (autenticado, com upload de foto)"
      }
    }
  });
});

// GET /tasks COM CACHE (público)
app.get("/tasks", cacheMiddleware('tasks', 30), async (req, res) => {
  try {
    console.log('📝 GET /tasks (TODAS as tarefas)');
    
    const tasks = await Task.findAll({ 
      order: [['createdAt', 'DESC']] 
    });
    
    console.log(`✅ Retornando ${tasks.length} tasks`);
    res.json(tasks);
  } catch (error) {
    console.error('❌ GET /tasks erro:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /signin - Login
app.post("/signin", async (req, res) => {
  try {
    console.log('🔍 POST /signin chamado pelo frontend');
    const { email, password } = req.body;
    
    console.log('📧 Email recebido:', email);
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email é obrigatório' 
      });
    }
    
    let user = await User.findOne({ where: { email } });
    
    if (!user) {
      const username = email.split('@')[0];
      user = await User.create({ username, email });
      console.log(`✅ Novo usuário criado: ${email}`);
    }
    
    console.log(`✅ Usuário encontrado/criado: ${user.username}`);
    
    const jwt = await import('jsonwebtoken');
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET || 'segredo_simples_dev',
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
    
    const response = {
      success: true,
      accessToken,
      refreshToken: accessToken,
      user: { id: user.id, name: user.username, email: user.email, photo: '' }
    };
    
    console.log(`✅ Token gerado para: ${email}`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ ERRO em /signin:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        success: false,
        error: 'Email já está em uso' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Erro interno no servidor',
      details: error.message 
    });
  }
});

// Rota de saúde
app.get("/health", async (req, res) => {
  try {
    const dbStatus = await bd.sequelize.authenticate();
    const redisStatus = await redis.ping();
    
    res.json({
      status: "healthy",
      database: "connected",
      redis: "connected",
      supabase: supabase ? "configured" : "not configured",
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message
    });
  }
});

// ============ ROTAS PROTEGIDAS (TASKS) ============

// POST /tasks (COM autenticação)
app.post("/tasks", authMiddleware, async (req, res) => {
  try {
    console.log('📝 POST /tasks');
    const { description } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: "Descrição obrigatória" });
    }
    
    const userId = req.user.id;
    
    const task = await Task.create({ 
      description, 
      completed: false,
      userId
    });
    
    await clearTasksCache();
    console.log(`✅ Task criada: ${task.id} para usuário ${req.user.email}`);
    res.status(201).json(task);
  } catch (error) {
    console.error('❌ POST /tasks erro:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /tasks/:id
app.delete("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.params.id || req.params.id === 'undefined') {
      console.log(`❌ ID inválido recebido: ${req.params.id}`);
      return res.status(400).json({ 
        error: "ID da tarefa inválido ou não fornecido" 
      });
    }
    
    console.log(`📝 DELETE /tasks/${req.params.id} por ${req.user.email}`);
    
    const task = await Task.findByPk(req.params.id);
    
    if (!task) {
      return res.status(404).json({ 
        error: "Tarefa não encontrada"
      });
    }
    
    await task.destroy();
    await clearTasksCache();
    console.log(`✅ Task deletada: ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    console.error('❌ DELETE /tasks erro:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /tasks/:id
app.put("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.params.id || req.params.id === 'undefined') {
      console.log(`❌ ID inválido recebido: ${req.params.id}`);
      return res.status(400).json({ 
        error: "ID da tarefa inválido ou não fornecido" 
      });
    }
    
    console.log(`📝 PUT /tasks/${req.params.id}`);
    const { description, completed } = req.body;
    
    const task = await Task.findByPk(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: "Tarefa não encontrada" });
    }
    
    if (description !== undefined) task.description = description;
    if (completed !== undefined) task.completed = completed;
    
    await task.save();
    await clearTasksCache();
    console.log(`✅ Task atualizada via PUT: ${task.id}`);
    res.json(task);
  } catch (error) {
    console.error('❌ PUT /tasks erro:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /tasks/:id
app.patch("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.params.id || req.params.id === 'undefined') {
      console.log(`❌ ID inválido recebido: ${req.params.id}`);
      return res.status(400).json({ 
        error: "ID da tarefa inválido ou não fornecido" 
      });
    }
    
    console.log(`📝 PATCH /tasks/${req.params.id}`);
    const { description, completed } = req.body;
    
    const task = await Task.findByPk(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: "Tarefa não encontrada" });
    }
    
    if (description !== undefined) task.description = description;
    if (completed !== undefined) task.completed = completed;
    
    await task.save();
    await clearTasksCache();
    console.log(`✅ Task atualizada: ${task.id}`);
    res.json(task);
  } catch (error) {
    console.error('❌ PATCH /tasks erro:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ============ ROTAS PROTEGIDAS (PERFIL) ============

// GET /profile
app.get("/profile", authenticate, async (req, res) => {
  try {
    console.log('🔍 GET /profile para:', req.user.email);
    
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'email', 'createdAt']
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuário não encontrado' 
      });
    }
    
    res.json({
      id: user.id,
      name: user.username,
      email: user.email,
      photo: ''
    });
    
  } catch (error) {
    console.error('❌ Erro em GET /profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno no servidor' 
    });
  }
});

// PUT /profile COM UPLOAD DE FOTO (SUA VERSÃO)
app.put("/profile", authenticate, async (req, res) => {
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

    // 3. ATUALIZAR NO BANCO
    const user = await User.findByPk(req.user.id);
    if (user) {
      if (name !== undefined) user.username = name;
      if (email !== undefined && email !== user.email) {
        const emailExists = await User.findOne({ where: { email } });
        if (emailExists && emailExists.id !== user.id) {
          return res.status(400).json({
            success: false,
            error: 'Email já está em uso por outro usuário'
          });
        }
        user.email = email;
      }
      await user.save();
    }

    // 4. RESPOSTA
    const updatedUser = {
      id: req.user.id,
      name: name || req.user.name,
      email: email || req.user.email,
      photo_url: photoUrl || null,
      message: photoBase64 ? 'Foto e perfil atualizados!' : 'Perfil atualizado!'
    };

    res.json(updatedUser);

  } catch (error) {
    console.error('❌ Erro em PUT /profile:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        success: false,
        error: 'Email já está em uso' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Erro interno no servidor',
      details: error.message 
    });
  }
});

// ============ ROTA DEBUG ============

app.post("/debug/auth", async (req, res) => {
  try {
    console.log('🔍 DEBUG /debug/auth');
    
    const authHeader = req.headers.authorization;
    console.log('🔐 Authorization header:', authHeader);
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      console.log('✅ Token recebido:', token.substring(0, 20) + '...');
      
      const jwt = await import('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo_simples_dev');
        console.log('✅ Token válido para:', decoded.email);
        
        return res.json({ success: true, message: 'Token válido!', user: decoded });
      } catch (jwtError) {
        console.log('❌ Token inválido:', jwtError.message);
        return res.json({ success: false, error: 'Token inválido', details: jwtError.message });
      }
    }
    
    res.json({ success: false, error: 'Token não fornecido' });
    
  } catch (error) {
    console.error('❌ Erro em debug:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log("=".repeat(50));
  console.log("🚀 Server rodando na porta", PORT);
  console.log("📦 Cache Redis ativo");
  console.log("🔐 AUTENTICAÇÃO JWT habilitada");
  console.log("☁️  Supabase Storage configurado");
  console.log("=".repeat(50));
  console.log("\n📋 Endpoints principais:");
  console.log("🔓 Públicos:");
  console.log("  GET  /          - Status da API");
  console.log("  GET  /health    - Saúde do sistema");
  console.log("  GET  /tasks     - Listar tarefas (com cache Redis)");
  console.log("  POST /signin    - Login com JWT");
  console.log("\n🔒 Autenticados:");
  console.log("  POST/PUT/PATCH/DELETE /tasks     - Gerenciar tarefas");
  console.log("  GET/PUT /profile                 - Perfil do usuário");
  console.log("=".repeat(50));
});