'use strict';
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 Verificando coluna userId...');
    
    // VERIFICA SE A COLUNA JÁ EXISTE ANTES DE TENTAR CRIAR
    const tableInfo = await queryInterface.describeTable('Tasks');
    
    if (tableInfo.userId) {
      console.log('✅ Coluna userId já existe, pulando criação...');
      return; // SAIA AQUI SE JÁ EXISTIR
    }
    
    console.log('🔄 Adicionando userId às Tasks existentes...');
    
    // 1. Adicionar coluna userId (permite null temporariamente)
    await queryInterface.addColumn('Tasks', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    console.log('✅ Coluna userId adicionada');

    // 2. Verificar se já existe usuário admin
    const [existingUsers] = await queryInterface.sequelize.query(
      `SELECT id FROM "Users" WHERE email = 'admin@todolist.com' LIMIT 1`
    );

    let userId;
    
    if (existingUsers.length === 0) {
      console.log('👤 Criando usuário admin...');
      // 3. Criar usuário admin (se não existir)
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const [newUser] = await queryInterface.bulkInsert('Users', [{
        id: Sequelize.literal('gen_random_uuid()'),
        username: 'admin',
        email: 'admin@todolist.com',
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date()
      }], { returning: ['id'] });
      
      userId = newUser.id;
      console.log(`✅ Usuário admin criado com ID: ${userId}`);
    } else {
      userId = existingUsers[0].id;
      console.log(`✅ Usuário admin já existe, ID: ${userId}`);
    }

    // 4. Associar todas tasks existentes ao usuário admin
    console.log('🔗 Associando tasks ao usuário admin...');
    const [result] = await queryInterface.sequelize.query(
      `UPDATE "Tasks" SET "userId" = :userId WHERE "userId" IS NULL RETURNING COUNT(*)`,
      {
        replacements: { userId },
        type: Sequelize.QueryTypes.UPDATE
      }
    );
    
    console.log(`✅ ${result[0]?.count || 0} tasks associadas ao usuário admin`);

    // 5. Agora tornar a coluna NOT NULL
    console.log('🔧 Tornando userId NOT NULL...');
    await queryInterface.changeColumn('Tasks', 'userId', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
    
    console.log('🎉 Migration concluída com sucesso!');
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Revertendo migration...');
    
    // 1. Remover NOT NULL constraint
    await queryInterface.changeColumn('Tasks', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    });

    // 2. Remover associações
    await queryInterface.sequelize.query(
      `UPDATE "Tasks" SET "userId" = NULL`
    );

    // 3. Remover coluna
    await queryInterface.removeColumn('Tasks', 'userId');
    
    console.log('✅ Migration revertida');
  }
};