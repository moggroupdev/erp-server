# MOG ERP

A manufacturing ERP system built for a commercial kitchen equipment company. It connects every stage of a project—from the first customer contact through production, procurement, delivery, and installation—on one centralized platform.

> **Note:** The system is actively under development. Core business areas are defined, but coverage is not yet complete across all departments and workflows.

---

## Purpose

Commercial kitchen equipment projects are rarely simple transactions. Each order may involve site-specific measurements, custom fabrication, multi-stage manufacturing, material procurement, and on-site installation. MOG ERP is designed to coordinate these moving parts so that sales, engineering, production, warehouse, purchasing, logistics, and installation teams work from the same source of truth.

---

## What the System Manages

### Customers & Projects

- Customer records and delivery locations
- Product inquiries listing requested equipment and quantities
- Site previews (site visits) to capture measurements, installation constraints, and technical requirements
- Sales quotations with pricing and validity
- Confirmed orders, including standard and custom-sized products

### Products & Engineering

- Product catalog organized by category (manufactured or imported items)
- Standard product dimensions stored on catalog items, with a standard BOM template defining required materials and quantities for those dimensions
- Custom dimensions captured during preview and carried through to the order
- Order-level Bill of Materials (BOM) prepared by the Technical Office for each order line (starting from the standard BOM when the item uses catalog dimensions)

### Manufacturing

- Production plans scheduling work across manufacturing departments
- Department hierarchy (Production parent with sub-departments such as cutting, bending, sheet metal, refrigeration, electrical, gas, and injection molding)
- Tracking progress per production department per order item

### Inventory & Warehouse

- Raw materials and spare parts with stock levels and minimum thresholds
- Material receipts into inventory after purchase inspection
- Material issues from the warehouse to production

### Procurement

- Approved suppliers (vendors) and their contact details
- Purchase orders raised when stock is insufficient
- Goods receipt with quality inspection (accepted and rejected quantities)
- Quotation requests sent to vendors when sourcing materials

### Delivery

- Scheduling and tracking shipment of finished products to the customer site
- Linking delivered items back to the originating order

### Access & Administration

- User accounts with role-based permissions for different departments
- Organizational departments with optional parent-child hierarchy and department managers

---

## End-to-End Business Process

The following describes the standard project lifecycle the system is built to support.

### 1. Customer Inquiry

The customer contacts the company requesting one or more products along with pricing information. An inquiry is opened and the requested items are recorded.

### 2. Site Preview

The Preview Team schedules and conducts a site visit. They inspect the customer's location, take measurements, assess installation requirements, and collect any additional technical information needed for the project.

### 3. Quotation

Based on the preview findings, the Sales Team prepares and submits a quotation to the customer.

### 4. Order Confirmation

If the customer approves the quotation, the project moves forward and manufacturing is initiated.

### 5. Bill of Materials

The Technical Office reviews the approved order and prepares the BOM, defining all materials and quantities required to produce each product in the order.

### 6. Production Planning

The BOM is forwarded to the Production Team, who plan and schedule manufacturing activities.

### 7. Material Request

Production requests the required raw materials from the Warehouse.

### 8. Stock Check

The Warehouse verifies whether the requested materials are available in stock.

### 9. Purchase Request

If any materials are unavailable or insufficient, the Warehouse raises a purchase request to the Purchasing Team.

### 10. Procurement

The Purchasing Team sources the required materials from approved suppliers.

### 11. Goods Inspection

Upon arrival, purchased materials are inspected to verify quality, specifications, and compliance with requirements.

### 12. Stock Receipt

Approved materials are received into inventory and stored in the Warehouse.

### 13. Material Issue

The required materials are issued from the Warehouse to the Production Team.

### 14. Manufacturing

Production carries out all required manufacturing stages according to the plan until finished products are completed.

### 15. Final Inspection

After production, finished products are inspected and prepared for delivery.

### 16. Delivery

Products are transported to the customer's site.

### 17. Installation & Commissioning

The Installation Team installs the equipment, performs testing and commissioning, and verifies correct operation.

### 18. Project Completion

The project is closed after successful installation, testing, and customer acceptance.

---

## Current Scope

The data model currently covers the core entities that support this workflow: customers, inquiries, previews, quotations, orders, BOMs, production plans, departments, materials, inventory movements, purchasing, and deliveries.

Areas still being expanded include installation tracking, additional reporting, and deeper workflow automation across departments. The schema and application features will continue to evolve as each business area is fully implemented.