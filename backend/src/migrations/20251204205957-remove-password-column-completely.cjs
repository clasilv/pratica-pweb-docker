'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove a coluna password completamente
    await queryInterface.removeColumn('Users', 'password');
    console.log('✅ Coluna password removida do banco!');
  },

  async down(queryInterface, Sequelize) {
    // Se precisar reverter
    await queryInterface.addColumn('Users', 'password', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};