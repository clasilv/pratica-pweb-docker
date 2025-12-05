import { extractTokenFromHeader, verifyToken } from '../routes/jwtUtils.js';

/**
 * Middleware de autenticação
 * Verifica token JWT e adiciona usuário ao request
 */
export const authMiddleware = async (req, res, next) => {
  try {
    // 1. Extrair token do header Authorization
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token de autenticação não fornecido' 
      });
    }
    
    // 2. Verificar token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ 
        error: 'Token inválido ou expirado' 
      });
    }
    
    // 3. Adicionar dados do usuário ao request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username
    };
    
    console.log(`✅ Usuário autenticado: ${req.user.email}`);
    next();
  } catch (error) {
    console.error('❌ Erro no middleware de autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro interno na autenticação' 
    });
  }
};