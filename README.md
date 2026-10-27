# MOG ERP

A manufacturing ERP system built for a commercial kitchen equipment company. It connects every stage of a project—from the first customer contact through production, procurement, delivery, and installation—on one centralized platform.

> **Note:** The system is actively under development. Core business areas are defined, but coverage is not yet complete across all departments and workflows.

---

## Purpose

Commercial kitchen equipment projects are rarely simple transactions. Each order may involve site-specific measurements, custom fabrication, multi-stage manufacturing, material procurement, and on-site installation. MOG ERP is designed to coordinate these moving parts so that sales, engineering, production, warehouse, purchasing, logistics, and installation teams work from the same source of truth.

---

## What the System Manages

### Customers & Sales Pipeline

- Customer records with classification (restaurant, hotel, tourist village, hospital, residential, and similar), optional website, tax number, and commercial registration, structured delivery addresses (country, governorate, and city), contact persons, and a blacklist timestamp when a customer is blocked
- Product inquiries listing requested equipment and quantities, progressing through preview scheduling, site visit, quotation, and acceptance or rejection
- Site previews: scheduled visits with assigned staff, per-item measurements, and technical notes
- Sales offers (quotations) with line pricing, validity period, status, and optional blanket discount negotiation (round log before acceptance)
- Contract reviews, the confirmed order, preserving the trail from inquiry through preview and offer, along with delivery address, expected delivery time, and work-order start date. Legacy contract reviews are entered without that trail and may omit the delivery address when fulfillment is at the factory; they keep the paper contract review number and work order number

### Products & Engineering

- Product catalog organized by category; each product is either manufactured in-house or imported from a supplier
- Product category trees (main and sub) can be created, updated, and deleted in the app
- Multiple dimension variants per product (either length & depth, or diameter, plus height - always in cm), with one marked as default; estimated production time and a pricing factor (multiplier on standard BOM cost) are set at the product level
- Customer-specific sizes are added as new rows in `product_dimensions` and get their own standard material recipe prepared when needed by the Technical Office
- Individual product units created for each contract review line, each with its own serial number

### Manufacturing

- Production plans scheduling work over a date range
- Per-product production routing: each manufactured product defines an ordered sequence of production departments (cutting, bending, turning, refrigeration, electricity, gas, injection, sheet metal, blacksmithing, kitchens, punch, paints, and others) with completion-percentage weights that sum to 100%
- Production department managers and deputy managers assigned per work-center (enum-identified; labels are a frontend concern)
- Work broken down per product unit and production department step, with sequential completion gating
- Progress notes and completion tracking per production department step

### Inventory & Warehouse

- Raw materials, spare parts, and manufactured materials with stock levels and minimum thresholds
- Material category trees (main and sub) can be created, updated, and deleted in the app
- Manufactured materials have their own bill of materials (BOM) listing the component materials required to produce them; components may themselves be manufactured materials
- Manufactured materials can store a manually set market manufacturing cost (outsourcing fee in the material's base unit), used on product BOM costing as a fallback when no last outsourcing order cost exists for an externally manufactured line
- Inventory movements: receipts from purchase inspection or outsourcing returns, issues to production, maintenance, or outsourcing suppliers, and returns
- Material issues linked to the production work, maintenance order material lines, or outsourcing order lines consuming them

### Procurement

- Approved suppliers with contact details, optional website, tax number, and commercial registration, material classification (aluminum, stainless steel, sheet steel, and similar), addresses, contact persons, and a blacklist timestamp when a supplier is blocked
- Material purchase requisitions (طلبات الشراء): warehouse requests materials for a production department; parallel approvals from planning, inventory control, and manager (each gate records yes/no with reason and timestamp); after full approval, purchasing may create MPOs that allocate quantity from one or more requisition lines (partial fulfillment across MPOs allowed; MPOs may still be created without a requisition)
- Material purchasing: purchase orders, goods receipt (partial receipts supported), quality inspection with accepted and rejected quantities, and optional stock intake via an inventory transaction (`transaction_type = 'receipt'`, linked to the materials receipt); requisition lines may optionally be attributed to the contract review line(s) driving the demand, and purchase lines inherit that attribution through their requisition allocations. An order can be updated within one day of creation (delivery, notes, lines, requisition allocations, and payment terms; the supplier stays fixed) until it is cancelled, completed, or has a receipt or supplier invoice. `updated_at` stays null until that first update, then records the time of each later update. An order can record delivery location and period, and payment slices (a percentage of the order, a fixed amount, or a single remainder) that together cover the full amount. Stock quantity / unit-price sync from those inventory receipts is deferred until issue posting exists.
- Supplier invoices: tax/e-invoice documents linked to exactly one of a material purchase order, product purchase order, or outsourcing order; one order may have multiple invoices over time; invoices can be created from an uploaded ETA PDF on a material purchase order (parsed in the app, confirmed by the user, then saved with the PDF), or seeded and later given a PDF via attach/replace (same parse-and-confirm flow, which also overwrites invoice number, date, and totals from the PDF)
- Product purchasing: orders and receipts for imported equipment tied to contract review lines, registering each received unit with supplier serial numbers where applicable
- Quotation request emails sent to suppliers when sourcing materials
- Requests for quotation (`RFQ-`): an RFQ lists materials and quantities with no requisition. It stays open until it is closed or cancelled. Each supplier has one quotation row on that RFQ. A material purchase order line may point at a quotation item from that supplier, including items from more than one RFQ, or at no quotation. Separate from quotation-request emails. Comparison is calculated later and is not stored

### Outsourcing

- External manufacturing of manufactured materials: send component materials from stock to a supplier, pay a manufacturing fee, and receive the finished manufactured material back into inventory
- Outsourcing orders track the agreed manufactured material quantities and unit manufacturing costs
- Materials are issued from stock to the supplier via inventory transactions linked to the outsourcing order (quantities suggested from the manufactured material BOM, adjustable before confirm); multiple partial issues per order are supported
- Outsourcing receipts inspect and accept/reject returned manufactured materials; accepted quantities enter stock via inventory transactions; multiple partial receipts per order are supported

### Delivery & Installation

- Each delivery and installation belongs to one contract review; the site address is the contract review's `delivery_address_id` when set (not stored on the task). A null address means fulfillment at the factory on ERP-native contract reviews; legacy contract reviews never record a delivery location
- Trips group deliveries, installations, and maintenance orders that travel together on the same vehicle across multiple addresses
- Installation scheduling and assignment for on-site commissioning
- Customer receptions: formal handover when the customer receives product units (factory pickup, after delivery, or after installation); starts the 1-year warranty period per unit
- Contract review completion when the project is finished or cancelled

### Maintenance & Service Contracts

- Service agreements: recurring maintenance contracts per customer address (monthly, quarterly, semi-annual, or annual intervals)
- Maintenance orders: in-warranty, out-of-warranty, or service-contract work on one or more product units; performed on-site at the customer or in-factory
- Materials of any type (spare parts, raw materials, manufactured materials) consumed during maintenance with selling-price snapshots; customer is billed for them except in-warranty work not caused by misuse

### Organization & Access

- User accounts with role-based permissions
- Logged-in users can view their own profile and change their password (no other self-service field updates)
- Department hierarchy for org-chart departments (Administration, HR, Finance, Production, and others) with optional parent-child structure and department managers
- Production staff belong to the Production org-chart department and are additionally assigned to one of fixed production departments (work-centers)

---

## End-to-End Business Process

The following describes how a typical project moves through the company, from first contact to completion.

### Sales and Discovery

A project begins when a customer reaches out requesting equipment and pricing. The company opens an inquiry and records the products and quantities the customer is interested in.

When a site visit is needed, the Preview Team schedules a preview, assigns staff, and visits the customer's location. They take measurements, assess installation constraints, and capture technical requirements — typically one preview line per inquiry product, copied at scheduling time as a standalone snapshot (same pattern as offer and contract review lines). When multiple site visits travel on the same vehicle, they can be grouped into a trip.

With preview findings in hand, the Sales Team prepares a quotation — an offer with line-level pricing and a validity period — and sends it to the customer. If the customer counters on price, sales records negotiation rounds (blanket discount) until terms are agreed. If the customer accepts, a contract review is created. This is the confirmed order: it carries the agreed products, prices, delivery address, and expected delivery time, and it remains linked to the original inquiry, preview, and offer for full traceability. When production or fulfillment work begins, the contract review's work-order start date (`started_at`) is recorded. Legacy contract reviews already in the paper system are recorded directly, without an inquiry, preview, or offer, and may have no customer delivery address when the order is fulfilled at the factory.

### Order Breakdown

Once a contract review is in place, the company breaks each active line item into individual product units — one serial-numbered physical item per unit ordered. Contract review lines are immutable once written: adding a line, removing one, or changing quantity, dimension variant, price, or product cancels the existing line (preserving who cancelled it and why) and, when the change is an amendment rather than a removal, creates a replacement line linked back via `previous_version_id`. From this point, manufactured and imported products follow different paths through the company.

### Engineering and Manufacturing

For items built in-house, the Technical Office prepares the standard BOMs for each dimension variant. Actual material costs are tracked through inventory transactions when materials are issued from the warehouse to the production floor.

Production then builds a plan that schedules each unit across the product's configured production departments — cutting, bending, sheet metal, refrigeration, electrical, and so on — in the order and completion weights defined on the product. Progress is tracked per unit and per production department step, with sequential gating so a step cannot be completed before the prior one. Manager and deputy manager are assigned per production department work-center.

### Materials and Warehouse

Before and during production, the Warehouse checks whether the required raw materials and manufactured materials are in stock. When stock is short, warehouse staff raise a material purchase requisition for the relevant production department. Planning, the purchasing manager, and the manager approve in parallel. Once fully approved, Purchasing may raise one or more material purchase orders with approved suppliers, allocating ordered quantities from the requisition line(s) — leftover quantity stays open until covered. An order can record where and when the goods are delivered, and payment slices — a percentage of the order, a fixed amount, or a single remainder — that together cover the full amount. Upon arrival, materials are inspected; accepted quantities are received into inventory, while rejected quantities are recorded separately.

When a manufactured material is manufactured externally, Purchasing (or Operations) raises an outsourcing order with a supplier. Component materials are issued from stock to the supplier based on the manufactured material's BOM (quantities suggested from the BOM, adjustable before confirm). When the supplier returns the finished manufactured material, it is inspected and accepted quantities are received into inventory; the manufacturing fee is tracked on the outsourcing order. Product BOM costing uses that last outsourcing fee, and can fall back to a manually set market manufacturing cost when no outsourcing history exists.

Materials are then issued from the warehouse to the production floor, linked to the specific production work consuming them.

### Sourcing Imported Products

For catalog items sourced from outside suppliers rather than built in-house, Purchasing places product purchase orders tied to the relevant contract review lines. When goods arrive, each unit is received and registered — including the supplier's serial number where applicable — and linked back to the contract review.

### Delivery, Installation, and Completion

Whether a unit was manufactured internally or received from a supplier, it eventually moves toward the customer. Each delivery and installation is tied to one contract review; the visit address comes from that contract review's delivery address when one is set, and is the factory when it is not. When multiple tasks travel on the same vehicle, they are grouped into a trip — a preview, delivery, installation, or maintenance visit to different addresses can share one trip.

Customer reception is recorded separately when the customer physically receives units — at the factory, after delivery, or after installation. That handover starts the 1-year warranty period for each unit. When every item is received and the project is accepted, the contract review is marked complete.

### After-Sales Maintenance

Once equipment is in the field, the company services it under three arrangements: in-warranty repair, out-of-warranty paid service, or a recurring service contract tied to a customer address. Maintenance orders may cover multiple units in one visit, performed on-site or with the product brought into the factory. Materials issued from inventory for the job are recorded with a price snapshot; whether the customer is charged is set per line.

---

## Current Scope

The data model covers the full project lifecycle described above — from customer inquiry through contract review, manufacturing or import, delivery, installation, completion, and after-sales maintenance. Contract review list and detail reads are available, and legacy contract reviews can be created. **Temporary:** legacy create currently allows missing line prices (null contract total) and does not record a delivery location, so incomplete paper contract reviews can be entered; this is not the ERP-native model. Material and product category trees can be maintained in the app. Application APIs and user-facing workflows are still being built on top of this foundation; not every step is yet available in the software.

Purchasing reports currently cover spending summary, material price history, purchasing by category / subcategory / supplier, invoice total variance, purchase requisition follow-up, price outliers (purchase-order lines whose unit price diverges sharply from nearby purchases of the same material), and average price gaps (stored `materials.unit_price` vs quantity-weighted purchase price).
