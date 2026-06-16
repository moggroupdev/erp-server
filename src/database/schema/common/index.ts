import { timestamp, customType, pgEnum, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const numericPrecision = { precision: 15, scale: 3 };

export const numeric = customType<{ data: number; driverData: string }>({
  dataType: () => `numeric(${numericPrecision.precision}, ${numericPrecision.scale})`,
  fromDriver: (value: string) => parseFloat(value),
  toDriver: (value: number) => value.toString(),
});

export const nonNegativeQuantityCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} >= 0`);

export const nonNegativeNullableQuantityCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} IS NULL OR ${column} >= 0`);

export const deletedAt = timestamp('deleted_at', { withTimezone: true });
export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const productCategoryEnum = pgEnum('product_category', [
  'gas_stove', // بوتاجاز غاز: للطهي باستخدام الغاز
  'electric_stove', // بوتاجاز كهرباء: للطهي باستخدام الكهرباء
  'gas_fryer', // قلاية غاز: لقلي الأطعمة باستخدام الغاز
  'electric_fryer', // قلاية كهرباء: لقلي الأطعمة باستخدام الكهرباء
  'pasta_cooker', // باستا كوكر: جهاز مخصص لسلق المكرونة
  'water_boiler', // غلاية مياه: لتسخين أو غلي المياه
  'salamander', // سلمندر: جهاز تحمير وتسخين علوي
  'bain_marie', // بان ماري: لحفظ الطعام ساخناً بحمام مائي
  'tilting_pan', // حلة تلتينج بان: حلة كبيرة قابلة للإمالة
  'boiling_pan', // حلة بويلينج بان: حلة صناعية للغلي والطهي
  'gas_grill', // شواية غاز: للشواء باستخدام الغاز
  'electric_grill', // شواية كهرباء: للشواء باستخدام الكهرباء
  'gas_oven', // فرن غاز: للخبز والطهي بالغاز
  'electric_oven', // فرن كهرباء: للخبز والطهي بالكهرباء
  'gas_pizza_oven', // فرن بيتزا غاز: مخصص لخبز البيتزا بالغاز
  'electric_pizza_oven', // فرن بيتزا كهرباء: مخصص لخبز البيتزا بالكهرباء
  'upright_refrigerator', // ثلاجة رأسية: ثلاجة عمودية للتبريد
  'chest_refrigerator', // ثلاجة أفقية: ثلاجة أو فريزر صندوقي
  'salad_refrigerator', // ثلاجة سلطات: لحفظ وتجهيز مكونات السلطات
  'water_cooler', // مبرد مياه: لتبريد مياه الشرب
  'trolley', // ترولي: عربة لنقل المعدات أو الطعام
  'table', // مائدة: طاولة عمل للمطابخ الصناعية
  'shelving_unit', // وحدة أرفف: للتخزين والتنظيم
  'wall_shelf', // رف حائطي: رف مثبت على الحائط
  'sink', // حوض: لغسيل الأدوات والمعدات
  'wall_cabinet', // دولاب حائطي: خزانة معلقة على الحائط
  'base_cabinet', // دولاب سفلي: خزانة أرضية للتخزين
  'hood', // هود: شفاط لسحب الأبخرة والروائح
  'floor_drain_channel', // جريلة صرف أرضية: لتصريف المياه من الأرضية
  'hinged_door', // باب مفصلي: باب يفتح في اتجاه واحد
  'swing_door', // باب مروحي: باب يفتح في الاتجاهين
  'overhead_light', // فانوس علوي: وحدة إضاءة مثبتة بالأعلى

  // For imported products
  'digital_scale', // ميزان رقمي
  'blender', // خلاط
  'microwave', // ميكرويف
]);

export const materialUnitEnum = pgEnum('material_unit', [
  'count',
  'kg',
  'gram',
  'meter',
  'cm',
  'liter',
  'sheet',
  'roll',
  'box',
]);

export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'pending',
  'preview_scheduled',
  'preview_done',
  'offer_sent',
  'offer_accepted',
  'offer_rejected',
  'cancelled',
]);

export const previewStatusEnum = pgEnum('preview_status', ['scheduled', 'done', 'cancelled']);

export const offerStatusEnum = pgEnum('offer_status', ['draft', 'sent', 'accepted', 'rejected', 'cancelled']);

export const orderStatusEnum = pgEnum('order_status', ['pending', 'in_progress', 'completed', 'cancelled']);

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', ['pending', 'in_progress', 'completed', 'cancelled']);

export const deliveryStatusEnum = pgEnum('delivery_status', ['pending', 'shipping', 'delivered', 'cancelled']);

export const productionDepartmentEnum = pgEnum('production_department', [
  'cutting', // قسم المقص
  'bending', // قسم الثني
  'refrigeration', // قسم التبريد
  'electricity', // قسم الكهرباء
  'gas', // قسم الغاز
  'injection', // قسم الحقن
  'neutral_sheet_metal', // قسم سمكرة متعادل
  'cold_sheet_metal', // قسم سمكرة بارد
  'hot_sheet_metal', // قسم سمكرة ساخن
  'blacksmithing', // قسم الحدادة
  'maintenance', // قسم الصيانة
]);
