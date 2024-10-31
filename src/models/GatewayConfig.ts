import { Model, DataTypes, Sequelize } from 'sequelize';
import { PAYMENT_GATEWAYS, PaymentGateway } from '../types/payment';

interface GatewayConfigAttributes {
    id: number;
    gateway: PaymentGateway;
    name: string;
    config: string; // Store as JSON string in DB
    is_active: boolean;
    test_mode: boolean;
    created_at: Date;
    updated_at: Date;
}

interface GatewayConfigCreationAttributes extends Omit<GatewayConfigAttributes, 'id' | 'created_at' | 'updated_at'> {}


export class GatewayConfig extends Model<GatewayConfigAttributes, GatewayConfigCreationAttributes> {
    declare id: number;
    declare gateway: PaymentGateway;
    declare name: string;
    declare config: string;
    declare is_active: boolean;
    declare test_mode: boolean;
    declare created_at: Date;
    declare updated_at: Date;
  
    // Helper methods to handle JSON conversion
    getConfig(): Record<string, any> {
      const value = this.getDataValue('config');
      return value ? JSON.parse(value) : {};
    }
  
    setConfig(value: Record<string, any>): void {
      this.setDataValue('config', JSON.stringify(value));
    }
  
    static initModel(sequelize: Sequelize): typeof GatewayConfig {
      GatewayConfig.init({
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        gateway: {
          type: DataTypes.ENUM(...PAYMENT_GATEWAYS),
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        config: {
          type: DataTypes.TEXT,
          allowNull: false,
          get() {
            return this.getConfig();
          },
          set(value: Record<string, any>) {
            this.setConfig(value);
          }
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        test_mode: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
      }, {
        sequelize,
        tableName: 'gateway_configs',
        timestamps: true,
        underscored: true,
      });
  
      return GatewayConfig;
    }
  }