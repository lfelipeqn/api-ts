import { Model, DataTypes, Sequelize } from 'sequelize';
import { PAYMENT_GATEWAYS, PaymentGateway, GatewayConfigData, GatewayConfigAttributes } from '../types/payment';

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
  

    getConfigObject(): GatewayConfigData {
      try {
        return typeof this.config === 'string' 
          ? JSON.parse(this.config) 
          : this.config;
      } catch (e) {
        console.warn('Failed to parse config:', e);
        return {};
      }
    }
    // Helper methods to handle JSON conversion
    getConfig(): Record<string, any> {
      try {
        return JSON.parse(this.getDataValue('config'));
      } catch {
        return {};
      }
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
            const rawValue = this.getDataValue('config');
            try {
              return typeof rawValue === 'string' 
                ? JSON.parse(rawValue) 
                : rawValue;
            } catch (e) {
              console.warn('Failed to parse config in getter:', e);
              return {};
            }
          },
          set(value: Record<string, any>) {
            this.setDataValue('config', 
              typeof value === 'string' ? value : JSON.stringify(value)
            );
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