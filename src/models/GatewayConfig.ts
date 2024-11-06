import { Model, DataTypes, Sequelize } from 'sequelize';
import { PAYMENT_GATEWAYS, PaymentGateway, GatewayConfigAttributes } from '../types/payment';

interface ConfigData {
  api_key: string;
  api_secret: string;
  endpoint: string;
  webhook_url?: string;
  private_key?: string;
  [key: string]: any;
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
  

    getConfig(): Record<string, any> {
      try {
        if (typeof this.config === 'object' && this.config !== null) {
          return this.config;
        }
        return JSON.parse(this.config);
      } catch (error) {
        console.error('Error parsing config:', error);
        throw new Error('Invalid gateway configuration format');
      }
    }
  
    setConfig(value: Record<string, any> | string): void {
      if (typeof value === 'string') {
        try {
          // Validate it's valid JSON
          JSON.parse(value);
          this.setDataValue('config', value);
        } catch (error) {
          throw new Error('Invalid JSON string provided for config');
        }
      } else {
        // Store object as JSON string
        this.setDataValue('config', JSON.stringify(value));
      }
    }

    getConfigObject(): ConfigData {
      try {
        return JSON.parse(this.config) as ConfigData;
      } catch (error) {
        console.error('Error parsing config:', error);
        throw new Error('Invalid gateway configuration format');
      }
    }

    setConfigObject(value: ConfigData): void {
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
              return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
            } catch (error) {
              return rawValue;
            }
          },
          set(value: Record<string, any> | string) {
            if (typeof value === 'string') {
              try {
                JSON.parse(value);
                this.setDataValue('config', value);
              } catch (error) {
                throw new Error('Invalid JSON string provided for config');
              }
            } else {
              this.setDataValue('config', JSON.stringify(value));
            }
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
        hooks: {
          beforeSave: (instance: GatewayConfig) => {
            // Ensure config is stored as a JSON string
            const config = instance.getDataValue('config');
            if (typeof config !== 'string') {
              instance.setDataValue('config', JSON.stringify(config));
            }
          },
          beforeValidate: (instance: GatewayConfig) => {
            // Ensure config is valid JSON
            const config = instance.getDataValue('config');
            if (typeof config !== 'string') {
              instance.setDataValue('config', JSON.stringify(config));
            } else {
              try {
                JSON.parse(config);
              } catch (error) {
                throw new Error('Invalid JSON configuration');
              }
            }
          }
        }
      });
  
      return GatewayConfig;
    }
  }