import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class User extends Model {
    static associate(models) {
      // Um User tem muitas Tasks
      User.hasMany(models.Task, {
        foreignKey: 'userId',
        as: 'tasks'
      });
    }
  }

  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: 'Username é obrigatório' },
        len: { args: [3, 30], msg: 'Username deve ter entre 3 e 30 caracteres' }
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: { msg: 'Email inválido' },
        notEmpty: { msg: 'Email é obrigatório' }
      }
    }
    // SEM CAMPO PASSWORD!
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'Users',
    timestamps: true
    // SEM HOOKS DE SENHA!
  });

  return User;
};