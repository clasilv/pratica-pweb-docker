// backend/src/routes/jwtUtils.js
import jwt from 'jsonwebtoken';

/**
 * Gera token JWT (versão simplificada sem senha)
 */
export const generateToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'segredo_simples_dev',
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

/**
 * Verifica token JWT
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'segredo_simples_dev');
  } catch (error) {
    console.error('❌ Token inválido:', error.message);
    return null;
  }
};

/**
 * Extrai token do header Authorization
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.split(' ')[1];
};