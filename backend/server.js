import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Redis from "ioredis";
import bd from "./src/models/index.js";
import authRoutes from "./src/routes/auth.js";
import { authMiddleware } from "./src/middleware/authMiddleware.js";

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

// Rotas de autenticação
app.use("/auth", authRoutes);

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

// ROTAS
app.get("/", (req, res) => {
  res.json({ 
    message: "API Todo List com Cache Redis",
    status: "online",
    auth: "habilitada",
    endpoints: {
      auth: {
        identify: "POST /auth/identify (apenas nome + email)",
        profile: "GET /auth/me (autenticado)"
      },
      tasks: {
        list: "GET /tasks (com cache)",
        create: "POST /tasks (autenticado)",
        delete: "DELETE /tasks/:id (autenticado)"
      }
    }
  });
});

// GET /tasks COM CACHE (público)
app.get("/tasks", cacheMiddleware('tasks', 30), async (req, res) => {
  try {
    console.log('📝 GET /tasks (TODAS as tarefas)');
    
    // MOSTRA TODAS AS TAREFAS, SEM FILTRO
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

// POST /tasks (COM autenticação)
app.post("/tasks", authMiddleware, async (req, res) => {
  try {
    console.log('📝 POST /tasks');
    const { description } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: "Descrição obrigatória" });
    }
    
    // Usa o usuário autenticado
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

/// NO DELETE /tasks/:id
app.delete("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    // VALIDAÇÃO NOVA: Verifica se o ID é válido
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


// PUT /tasks/:id (COM autenticação) - Para o frontend usar
// NO PUT /tasks/:id
app.put("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    // VALIDAÇÃO NOVA: Verifica se o ID é válido
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

// PATCH /tasks/:id - Atualizar tarefa (marcar como completa)
// NO PATCH /tasks/:id (também adicione)
app.patch("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    // VALIDAÇÃO NOVA
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

// Rota de saúde da API (pública)
app.get("/health", async (req, res) => {
  try {
    const dbStatus = await bd.sequelize.authenticate();
    const redisStatus = await redis.ping();
    
    res.json({
      status: "healthy",
      database: "connected",
      redis: "connected",
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

// ============ NOVAS ROTAS PARA COMPATIBILIDADE COM FRONTEND ============

// Endpoint /signin - Compatível com frontend (aceita email, ignora password)
app.post("/signin", async (req, res) => {
  try {
    console.log('🔍 POST /signin chamado pelo frontend');
    const { email, password } = req.body;
    
    console.log('📧 Email recebido:', email);
    console.log('🔐 Password recebido:', password ? '***' : 'não fornecido');
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email é obrigatório' 
      });
    }
    
    // Busca usuário pelo email
    let user = await User.findOne({ 
      where: { email } 
    });
    
    // Se não existe, cria novo (sem senha, sistema simplificado)
    if (!user) {
      // Gera username a partir do email
      const username = email.split('@')[0];
      
      try {
        user = await User.create({
          username,
          email
        });
        console.log(`✅ Novo usuário criado: ${email}`);
      } catch (createError) {
        console.error('❌ Erro ao criar usuário:', createError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao criar usuário'
        });
      }
    }
    
    console.log(`✅ Usuário encontrado/criado: ${user.username} (${user.email})`);
    
    // Gera token (formato que frontend espera)
    const jwt = await import('jsonwebtoken');
    const accessToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET || 'segredo_simples_dev',
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
    
    console.log(`✅ Token gerado para: ${email}`);
    
    // Retorna no formato EXATO que o frontend espera
    const response = {
      success: true,
      accessToken,
      refreshToken: accessToken, // Mesmo token como refresh (simplificado)
      user: {
        id: user.id,
        name: user.username, // Frontend espera "name", não "username"
        email: user.email,
        photo: '' // Campo vazio, pode ser preenchido depois
      }
    };
    
    console.log('📤 Enviando resposta:', JSON.stringify(response).substring(0, 100) + '...');
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

// Endpoint /profile (GET) - Compatível com frontend
app.get("/profile", authMiddleware, async (req, res) => {
  try {
    console.log('🔍 GET /profile para:', req.user.email);
    
    // Busca usuário no banco
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'email', 'createdAt']
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuário não encontrado' 
      });
    }
    
    // Retorna no formato que frontend espera
    res.json({
      id: user.id,
      name: user.username, // Mapeia username para name
      email: user.email,
      photo: '' // Campo vazio por enquanto
    });
    
  } catch (error) {
    console.error('❌ Erro em GET /profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno no servidor' 
    });
  }
});

// Endpoint /profile (PUT) para atualização
app.put("/profile", authMiddleware, async (req, res) => {
  try {
    console.log('🔍 PUT /profile por:', req.user.email);
    console.log('📦 Dados recebidos:', req.body);
    
    const { name, email, photo } = req.body;
    
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuário não encontrado' 
      });
    }
    
    // Atualiza campos permitidos
    if (name !== undefined) {
      console.log(`📝 Atualizando nome: ${user.username} -> ${name}`);
      user.username = name;
    }
    
    if (email !== undefined && email !== user.email) {
      console.log(`📝 Atualizando email: ${user.email} -> ${email}`);
      
      // Verifica se novo email já existe
      const emailExists = await User.findOne({ where: { email } });
      if (emailExists && emailExists.id !== user.id) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso por outro usuário'
        });
      }
      user.email = email;
    }
    
    // photo seria salvo em outro lugar (Supabase - parte da sua dupla)
    
    await user.save();
    console.log('✅ Perfil atualizado com sucesso');
    
    res.json({
      id: user.id,
      name: user.username,
      email: user.email,
      photo: photo || ''
    });
    
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

// Rota de debug para verificar autenticação
app.post("/debug/auth", async (req, res) => {
  try {
    console.log('🔍 DEBUG /debug/auth');
    console.log('📦 Headers:', req.headers);
    
    const authHeader = req.headers.authorization;
    console.log('🔐 Authorization header:', authHeader);
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      console.log('✅ Token recebido:', token.substring(0, 20) + '...');
      
      const jwt = await import('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo_simples_dev');
        console.log('✅ Token válido para:', decoded.email);
        
        return res.json({
          success: true,
          message: 'Token válido!',
          user: decoded
        });
      } catch (jwtError) {
        console.log('❌ Token inválido:', jwtError.message);
        return res.json({
          success: false,
          error: 'Token inválido',
          details: jwtError.message
        });
      }
    }
    
    res.json({
      success: false,
      error: 'Token não fornecido',
      tip: 'Enviar: Authorization: Bearer SEU_TOKEN'
    });
    
  } catch (error) {
    console.error('❌ Erro em debug:', error);
    res.status(500).json({ error: error.message });
  }
});
// ============ FIM DAS NOVAS ROTAS ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log("=".repeat(50));
  console.log("🚀 Server rodando na porta", PORT);
  console.log("📦 Cache Redis ativo");
  console.log("🔐 AUTENTICAÇÃO HABILITADA");
  console.log("📊 NOVAS ROTAS ADICIONADAS:");
  console.log("  POST /signin     - Login compatível com frontend");
  console.log("  GET  /profile    - Perfil do usuário");
  console.log("  PUT  /profile    - Atualizar perfil");
  console.log("  POST /debug/auth - Debug de autenticação");
  console.log("=".repeat(50));
  console.log("\n📋 Endpoints disponíveis:");
  console.log("🔓 Públicos:");
  console.log("  GET  /          - Status da API");
  console.log("  GET  /health    - Saúde do sistema");
  console.log("  GET  /tasks     - Listar tarefas (com cache)");
  console.log("  POST /auth/identify - Identificar-se (nome + email)");
  console.log("  POST /signin     - Login (email apenas)");
  console.log("\n🔒 Autenticados (token JWT no header):");
  console.log("  POST /tasks     - Criar tarefa");
  console.log("  PUT  /tasks/:id - Atualizar tarefa");
  console.log("  PATCH /tasks/:id - Atualizar tarefa");
  console.log("  DELETE /tasks/:id - Remover tarefa");
  console.log("  GET  /auth/me   - Ver seu perfil");
  console.log("  GET  /profile   - Perfil (frontend)");
  console.log("  PUT  /profile   - Atualizar perfil");
  console.log("=".repeat(50));
  console.log("\n💡 Dica: Use /signin com qualquer email (senha é ignorada)!");
});