import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Agency } from './Agency';
import { Product } from './Product';
import { ComplementaryAgency } from './ComplementaryAgency';
import { User } from './User';
import { Notification } from './Notification';

export class ProductTransfer extends Model {
  public id!: number;
  public state!: string;
  public amount!: number;
  public dispatch_agency_id!: number;
  public destination_agency_id!: number;
  public product_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly dispatchAgency?: Agency;
  public readonly destinationAgency?: Agency;
  public readonly product?: Product;
  public readonly complementaryAgencies?: ComplementaryAgency[];

  public static associations: {
    dispatchAgency: Association<ProductTransfer, Agency>;
    destinationAgency: Association<ProductTransfer, Agency>;
    product: Association<ProductTransfer, Product>;
    complementaryAgencies: Association<ProductTransfer, ComplementaryAgency>;
  };

  static initModel(sequelize: Sequelize): typeof ProductTransfer {
    ProductTransfer.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      dispatch_agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      destination_agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'product_transfers',
      timestamps: true,
      underscored: true,
    });

    return ProductTransfer;
  }

  static associate(models: any) {
    ProductTransfer.belongsTo(models.Agency, { foreignKey: 'dispatch_agency_id', as: 'dispatchAgency' });
    ProductTransfer.belongsTo(models.Agency, { foreignKey: 'destination_agency_id', as: 'destinationAgency' });
    ProductTransfer.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    ProductTransfer.hasMany(models.ComplementaryAgency, { foreignKey: 'product_transfer_id', as: 'complementaryAgencies' });
  }

  async receive(): Promise<void> {
    await this.update({ state: 'R' });
    const orders = new Set<number>();

    const complementaryAgencies = await this.$get('complementaryAgencies', {
      include: [{
        model: ComplementaryAgency.associations.orderPriceHistory.target,
        as: 'orderPriceHistory',
        include: [{
          model: ComplementaryAgency.associations.orderPriceHistory.target.associations.order.target,
          as: 'order'
        }]
      }]
    });

    for (const complementaryAgency of complementaryAgencies) {
      await complementaryAgency.update({ state: 'ED' });
      const order = complementaryAgency.orderPriceHistory.order;
      orders.add(order.id);
    }

    // Analyze each order involved in the product transfer
    for (const orderId of orders) {
      const order = await Order.findByPk(orderId);
      if (order && await order.stockInDispatchAgency()) {
        if (order.payment_method === 'CE' || (order.payment_method === 'EF' && order.payment_state === 'R')) {
          await order.notifyOrderPendingGuide();
        }
        if (order.payment_method !== 'CE' && order.payment_method !== 'EF') {
          if (await order.stockInDispatchAgency()) {
            await order.notifyOrderPendingGuide();
          }
        }
      }
    }
  }

  static async notifyNewProductsPendingTransferToMagister(agencies: number[] | null = null): Promise<void> {
    const message = "Se ha actualizado la lista de productos pendientes por transferir a la agencia virtual";
    let users: number[];

    if (agencies) {
      users = (await User.findAll({
        where: {
          state: 'Activo',
          agency_id: agencies
        },
        include: [{
          model: Role,
          where: { name: 'gestor_bodega' }
        }]
      })).map(user => user.id);
    } else {
      users = (await User.findAll({
        where: { state: 'Activo' },
        include: [{
          model: Role,
          where: { name: 'asesor_bat_virtual' }
        }]
      })).map(user => user.id);
    }

    if (users.length > 0) {
      const notification = await Notification.register(
        "new_products_pending_transfer_to_magister",
        null,
        message,
        null,
        "/transfers-to-virtual",
        0,
        null,
        null,
        null,
        null
      );
      await notification.$add('users', users);
      await notification.send();
    }
  }
}