import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class Task extends Model {
    static associate(models) {
      // Uma Task pertence a um User
      Task.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
    }
  }

  Task.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: true, // mudando temporariamente
      references: {
        model: 'Users', // Nome da tabela no banco
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Task',
    tableName: 'Tasks',
    timestamps: true
  });

  return Task;
};