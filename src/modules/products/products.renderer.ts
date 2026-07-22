import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { asc, isNull } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { products } from 'src/database/schema';
import { PRODUCT_SOURCE_TYPES } from 'src/utils/constants';

type CatalogProduct = Awaited<ReturnType<ProductsRenderer['fetchCatalogData']>>[number];

const SOURCE_TYPE_LABELS: Record<string, string> = {
  [PRODUCT_SOURCE_TYPES.MANUFACTURED]: 'مصنع',
  [PRODUCT_SOURCE_TYPES.IMPORTED]: 'مستورد',
};

const DIMENSION_UNIT_LABELS: Record<string, string> = { m: 'م', cm: 'سم', mm: 'مم' };

@Injectable()
export class ProductsRenderer {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async renderCatatlog(): Promise<string> {
    const catalogProducts = await this.fetchCatalogData();
    const dimensionCount = catalogProducts.reduce((sum, product) => sum + product.dimensions.length, 0);
    const content = this.buildContent(catalogProducts);
    const generatedAt = new Date().toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const values: Record<string, string> = {
      PRODUCT_COUNT: String(catalogProducts.length),
      DIMENSION_COUNT: String(dimensionCount),
      CONTENT: content,
      GENERATED_AT: generatedAt,
    };

    return this.readTemplate().replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
  }

  // ========================= PRIVATE METHODS =========================

  private async fetchCatalogData() {
    return await this.db.query.products.findMany({
      where: isNull(products.deletedAt),
      with: {
        dimensions: true,
        subCategory: { with: { mainCategory: true } },
      },
      orderBy: asc(products.title),
    });
  }

  private buildContent(catalogProducts: CatalogProduct[]): string {
    if (catalogProducts.length === 0) {
      return `<div class="empty-state">
        <h2>لا توجد منتجات</h2>
        <p>لم يتم إضافة أي منتجات إلى النظام بعد.</p>
      </div>`;
    }

    const grouped = new Map<string, CatalogProduct[]>();

    for (const product of catalogProducts) {
      const mainTitle = product.subCategory?.mainCategory?.title ?? 'غير مصنف';
      const group = grouped.get(mainTitle) ?? [];
      group.push(product);
      grouped.set(mainTitle, group);
    }

    const sections = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ar'))
      .map(([mainTitle, items]) => this.buildCategorySection(mainTitle, items))
      .join('\n');

    return sections;
  }

  private buildCategorySection(mainTitle: string, items: CatalogProduct[]): string {
    const cards = items.map((product) => this.buildProductCard(product)).join('\n');

    return `<section class="category-section">
      <div class="category-header">
        <h2>${escapeHtml(mainTitle)}</h2>
        <span class="category-count">${items.length} منتج</span>
      </div>
      <div class="products-grid">
        ${cards}
      </div>
    </section>`;
  }

  private buildProductCard(product: CatalogProduct): string {
    const searchText = [
      product.code,
      product.title,
      product.description,
      product.subCategory?.title,
      product.subCategory?.mainCategory?.title,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const sourceClass = product.sourceType === PRODUCT_SOURCE_TYPES.MANUFACTURED ? 'source-manufactured' : 'source-imported';
    const sourceLabel = SOURCE_TYPE_LABELS[product.sourceType] ?? product.sourceType;

    const productionRow =
      product.estimatedProductionTime != null
        ? `<span class="meta-label">مدة الإنتاج</span><span class="meta-value">${escapeHtml(String(product.estimatedProductionTime))} يوم</span>`
        : '';

    const description = product.description ? `<p class="product-desc">${escapeHtml(product.description)}</p>` : '';

    const subCategoryRow = product.subCategory?.title
      ? `<span class="meta-label">الفئة</span><span class="meta-value">${escapeHtml(product.subCategory.title)}</span>`
      : '';

    return `<article class="product-card" data-search="${escapeHtml(searchText)}">
      <div class="product-header">
        <h3 class="product-title">${escapeHtml(product.title)}</h3>
        <span class="source-badge ${sourceClass}">${escapeHtml(sourceLabel)}</span>
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span class="meta-label">الكود</span><span class="meta-value code">${escapeHtml(product.code)}</span>
          ${subCategoryRow}
          ${productionRow}
          <span class="meta-label">معامل التسعير</span><span class="meta-value">${escapeHtml(String(product.pricingFactor))}</span>
        </div>
        ${description}
        <div class="dimensions-block">
          <div class="dimensions-title">المقاسات <span class="count">(${product.dimensions.length})</span></div>
          ${this.buildDimensionsTable(product.dimensions)}
        </div>
      </div>
    </article>`;
  }

  private buildDimensionsTable(dimensions: CatalogProduct['dimensions']): string {
    if (dimensions.length === 0) {
      return '<div class="no-dims">لا توجد مقاسات مسجلة</div>';
    }

    const sorted = [...dimensions].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

    const rows = sorted
      .map((dim) => {
        const unit = DIMENSION_UNIT_LABELS[dim.dimensionUnit] ?? dim.dimensionUnit;
        const statusCell = dim.isDefault
          ? '<td class="col-status"><span class="default-pill" title="افتراضي">افتراضي</span></td>'
          : '<td class="col-status"></td>';
        const rowClass = dim.isDefault ? 'default-row' : '';

        return `<tr class="${rowClass}">
          ${statusCell}
          <td class="dim-value">${escapeHtml(String(dim.length))}</td>
          <td class="dim-value">${escapeHtml(String(dim.depth))}</td>
          <td class="dim-value">${escapeHtml(String(dim.height))}</td>
          <td class="dim-unit">${escapeHtml(unit)}</td>
        </tr>`;
      })
      .join('');

    return `<div class="dimensions-table-wrap">
      <table class="dim-table">
        <thead>
          <tr>
            <th class="col-status" aria-label="الحالة"></th>
            <th>طول</th>
            <th>عمق</th>
            <th>ارتفاع</th>
            <th>وحدة</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  private readTemplate(): string {
    const candidates = [
      join(__dirname, '..', '..', 'assets', 'products-catalog.html'),
      join(process.cwd(), 'src', 'assets', 'products-catalog.html'),
      join(process.cwd(), 'dist', 'src', 'assets', 'products-catalog.html'),
    ];

    for (const path of candidates) {
      if (existsSync(path)) return readFileSync(path, 'utf8');
    }

    throw new Error('Products catalog HTML template not found (src/assets/products-catalog.html).');
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
