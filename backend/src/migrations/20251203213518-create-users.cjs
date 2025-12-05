'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Adicionar índice para email (já que é unique, mas explícito é melhor)
    await queryInterface.addIndex('Users', ['email'], {
      name: 'users_email_index',
      unique: true
    });

    // Adicionar índice para username
    await queryInterface.addIndex('Users', ['username'], {
      name: 'users_username_index',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    // Remover índices primeiro
    await queryInterface.removeIndex('Users', 'users_email_index');
    await queryInterface.removeIndex('Users', 'users_username_index');
    
    // Remover tabela
    await queryInterface.dropTable('Users');
  }
};