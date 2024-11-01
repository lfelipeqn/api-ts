import { Model, DataTypes, Sequelize, Association, BelongsToGetAssociationMixin } from 'sequelize';
import { 
  PAYMENT_METHOD_TYPES, 
  PAYMENT_GATEWAYS, 
  PaymentMethodType, 
  PaymentGateway 
} from '../types/payment';
import { GatewayConfig } from '../models/GatewayConfig';

interface PaymentMethodConfigAttributes {
  id: number;
  type: PaymentMethodType;
  name: string;
  description?: string;
  enabled: boolean;
  min_amount?: number;
  max_amount?: number;
  payment_gateway: PaymentGateway;
  gateway_config_id: number;
  created_at: Date;
  updated_at: Date;
}
  
  interface PaymentMethodConfigCreationAttributes extends Omit<PaymentMethodConfigAttributes, 'id' | 'created_at' | 'updated_at'> {}
  

  export class PaymentMethodConfig extends Model<PaymentMethodConfigAttributes, PaymentMethodConfigCreationAttributes> {
    declare id: number;
    declare type: PaymentMethodType;
    declare name: string;
    declare description: string | null;
    declare enabled: boolean;
    declare min_amount: number | null;
    declare max_amount: number | null;
    declare payment_gateway: PaymentGateway;
    declare gateway_config_id: number;
    declare created_at: Date;
    declare updated_at: Date;

    declare readonly gatewayConfig?: GatewayConfig;
    declare getGatewayConfig: BelongsToGetAssociationMixin<GatewayConfig>;

     // Declare associations
    public static associations: {
      gatewayConfig: Association<PaymentMethodConfig, GatewayConfig>;
    };
  
    static initModel(sequelize: Sequelize): typeof PaymentMethodConfig {
      PaymentMethodConfig.init({
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        type: {
          type: DataTypes.ENUM(...PAYMENT_METHOD_TYPES),
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        min_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
        },
        max_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
        },
        payment_gateway: {
          type: DataTypes.ENUM(...PAYMENT_GATEWAYS),
          allowNull: false,
        },
        gateway_config_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
      }, {
        sequelize,
        tableName: 'payment_method_configs',
        timestamps: true,
        underscored: true,
      });
  
      return PaymentMethodConfig;
    }
  
    static associate(models: any) {
      PaymentMethodConfig.belongsTo(models.GatewayConfig, {
        foreignKey: 'gateway_config_id',
        as: 'gatewayConfig'
      });
    }
  }
  