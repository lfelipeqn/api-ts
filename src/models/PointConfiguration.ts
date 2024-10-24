import { Model, DataTypes, Sequelize } from 'sequelize';

export class PointConfiguration extends Model {
  public id!: number;
  public currency_to_points!: number;
  public points_to_currency!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  static initModel(sequelize: Sequelize): typeof PointConfiguration {
    PointConfiguration.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      currency_to_points: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      points_to_currency: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'point_configurations',
      timestamps: true,
      underscored: true,
    });

    return PointConfiguration;
  }

  convertToCurrency(points: number): number {
    return Math.floor(this.points_to_currency * points);
  }

  convertToPoints(value: number): number {
    return Math.floor(this.currency_to_points * value);
  }

  // Static methods
  static async current(): Promise<PointConfiguration> {
    return this.findOne({
      order: [['created_at', 'DESC']]
    }) as Promise<PointConfiguration>;
  }

  static async pointsToCurrency(points: number): Promise<number> {
    const currentConfig = await this.current();
    return currentConfig.convertToCurrency(points);
  }

  static async currencyToPoint(value: number): Promise<number> {
    const currentConfig = await this.current();
    return currentConfig.convertToPoints(value);
  }
}