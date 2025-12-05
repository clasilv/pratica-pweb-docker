// backend/src/routes/auth.js (VERSÃO COM DEBUG)
import express from 'express';
import { generateToken } from './jwtUtils.js';
import bd from '../models/index.js';

console.log('🔍 auth.js está sendo carregado...'); // LOG NOVO

const { User } = bd;
const router = express.Router();

/**
 * Rota principal de identificação - APENAS nome e email
 * POST /auth/identify
 */
router.post('/identify', async (req, res) => {
  console.log('🔍 POST /auth/identify chamado'); // LOG NOVO
  
  try {
    const { username, email } = req.body;
    console.log(`🔍 Dados recebidos: username=${username}, email=${email}`); // LOG NOVO
    
    if (!username || !email) {
      console.log('❌ Falta username ou email'); // LOG NOVO
      return res.status(400).json({ 
        error: 'Nome e email são obrigatórios' 
      });
    }
    
    // Validação simples de email
    if (!email.includes('@')) {
      console.log('❌ Email inválido'); // LOG NOVO
      return res.status(400).json({ 
        error: 'Email inválido' 
      });
    }
    
    // Tenta buscar usuário existente
    console.log(`🔍 Buscando usuário: ${username}`); // LOG NOVO
    let user = await User.findOne({ 
      where: { username } 
    });
    
    console.log(`🔍 Usuário encontrado? ${!!user}`); // LOG NOVO
    
    // Se não existe, cria novo (SEM SENHA!)
    if (!user) {
      console.log(`👤 Criando novo usuário: ${username}`); // LOG NOVO
      try {
        user = await User.create({
          username,
          email
        });
        console.log(`✅ Usuário criado com ID: ${user.id}`); // LOG NOVO
      } catch (createError) {
        console.error('❌ Erro ao criar usuário:', createError.message); // LOG NOVO
        throw createError;
      }
    }
    
    // Gera token
    console.log(`🔍 Gerando token para ${user.username}`); // LOG NOVO
    const token = generateToken(user);
    
    console.log(`✅ Token gerado para ${user.username}`); // LOG NOVO
    res.json({
      message: '✅ Identificado com sucesso!',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
    
  } catch (error) {
    console.error('❌ ERRO COMPLETO na identificação:', error); // LOG DETALHADO
    console.error('❌ Stack trace:', error.stack); // LOG NOVO
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      console.log('❌ Erro de unicidade'); // LOG NOVO
      return res.status(400).json({ 
        error: 'Nome ou email já estão em uso' 
      });
    }
    
    // Log detalhado do erro do Sequelize
    if (error.name === 'SequelizeValidationError') {
      console.error('❌ Erros de validação:', error.errors.map(e => e.message).join(', '));
    }
    
    res.status(500).json({ 
      error: 'Erro interno no servidor' 
    });
  }
});


/**
 * Rota para ver perfil do usuário
 * GET /auth/me
 */
router.get('/me', async (req, res) => {
  try {
    // req.user vem do authMiddleware
    console.log('🔍 GET /auth/me para:', req.user?.email);
    
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'email', 'createdAt']
    });
    
    if (!user) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado' 
      });
    }
    
    res.json({ user });
    
  } catch (error) {
    console.error('❌ Erro em /me:', error);
    res.status(500).json({ 
      error: 'Erro interno no servidor' 
    });
  }
});
export default router;