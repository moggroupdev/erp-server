# MOG ERP

A manufacturing ERP system built for a commercial kitchen equipment company. It connects every stage of a project—from the first customer contact through production, procurement, delivery, and installation—on one centralized platform.

> **Note:** The system is actively under development. Core business areas are defined, but coverage is not yet complete across all departments and workflows.

---

## Purpose

Commercial kitchen equipment projects are rarely simple transactions. Each order may involve site-specific measurements, custom fabrication, multi-stage manufacturing, material procurement, and on-site installation. MOG ERP is designed to coordinate these moving parts so that sales, engineering, production, warehouse, purchasing, logistics, and installation teams work from the same source of truth.

---

## What the System Manages

### Customers & Sales Pipeline

- Customer records with structured delivery addresses (country, governorate, and city)
- Product inquiries listing requested equipment and quantities, progressing through preview scheduling, site visit, quotation, and acceptance or rejection
- Site previews: scheduled visits with assigned staff, per-item measurements, and technical notes
- Sales offers (quotations) with line pricing, validity period, and status
- Contracts — the confirmed order — preserving the trail from inquiry through preview and offer, along with delivery address, expected delivery time, and work-order start date

### Products & Engineering

- Product catalog organized by category; each product is either manufactured in-house or imported from a supplier
- Multiple dimension variants per product (length, width, height, unit), with one marked as default; estimated production time is set at the product level
- Customer-specific sizes are added as new rows in `product_dimensions` and get their own standard material recipe prepared when needed by the Technical Office
- Individual product units created for each contract line, each with its own serial number
### Manufacturing

- Production plans scheduling work over a date range
- Work broken down per product unit and manufacturing department (cutting, bending, sheet metal, refrigeration, electrical, gas, injection molding, and others)
- Progress notes and completion tracking per department step

### Inventory & Warehouse

- Raw materials and spare parts with stock levels and minimum thresholds
- Inventory movements: receipts from purchase inspection, issues to production, and returns
- Material issues linked to the production work consuming them

### Procurement

- Approved suppliers with contact details and addresses
- Material purchasing: purchase orders, goods receipt, quality inspection with accepted and rejected quantities, and stock intake
- Product purchasing: orders and receipts for imported equipment tied to contract lines, registering each received unit with vendor serial numbers where applicable
- Quotation request emails sent to vendors when sourcing materials

### Delivery & Installation

- Delivery scheduling and assignment, linking specific product units to each shipment
- Installation scheduling and assignment, commissioning individual units at the customer site
- Contract completion when the project is finished or cancelled

### Organization & Access

- User accounts with role-based permissions
- Department hierarchy with optional parent-child structure and department managers

---

## End-to-End Business Process

The following describes how a typical project moves through the company, from first contact to completion.

### Sales and Discovery

A project begins when a customer reaches out requesting equipment and pricing. The company opens an inquiry and records the products and quantities the customer is interested in.

When a site visit is needed, the Preview Team schedules a preview, assigns staff, and visits the customer's location. They take measurements, assess installation constraints, and capture technical requirements — typically one preview line per inquiry product, copied at scheduling time as a standalone snapshot (same pattern as offer and contract lines).

With preview findings in hand, the Sales Team prepares a quotation — an offer with line-level pricing and a validity period — and sends it to the customer. If the customer accepts, a contract is created. This is the confirmed order: it carries the agreed products, prices, delivery address, and expected delivery time, and it remains linked to the original inquiry, preview, and offer for full traceability. When production or fulfillment work begins, the contract's work-order start date (`started_at`) is recorded.

### Order Breakdown

Once a contract is in place, the company breaks each active line item into individual product units — one serial-numbered physical item per unit ordered. Contract lines are immutable once written: adding a line, removing one, or changing quantity, dimension variant, price, or product cancels the existing line (preserving who cancelled it and why) and, when the change is an amendment rather than a removal, creates a replacement line linked back via `previous_version_id`. From this point, manufactured and imported products follow different paths through the company.

### Engineering and Manufacturing

For items built in-house, the Technical Office prepares the standard BOMs for each dimension variant. Actual material costs are tracked through inventory transactions when materials are issued from the warehouse to the production floor.

Production then builds a plan that schedules each unit across the relevant manufacturing departments — cutting, bending, sheet metal, refrigeration, electrical, and so on. Progress is tracked per unit and per department, with notes recorded as work moves through each stage.

### Materials and Warehouse

Before and during production, the Warehouse checks whether the required raw materials are in stock. When stock is short, Purchasing raises material purchase orders with approved suppliers. Upon arrival, materials are inspected; accepted quantities are received into inventory, while rejected quantities are recorded separately.

Materials are then issued from the warehouse to the production floor, linked to the specific production work consuming them.

### Sourcing Imported Products

For catalog items sourced from outside suppliers rather than built in-house, Purchasing places product purchase orders tied to the relevant contract lines. When goods arrive, each unit is received and registered — including the supplier's serial number where applicable — and linked back to the contract.

### Delivery, Installation, and Completion

Whether a unit was manufactured internally or received from a supplier, it eventually moves toward the customer. Deliveries are scheduled and assigned to staff; each shipment lists the specific product units being transported to the site.

After delivery, the Installation Team schedules on-site work, installs the equipment, and performs testing and commissioning for each unit. When every item is installed and the project is accepted, the contract is marked complete.

---

## Current Scope

The data model covers the full project lifecycle described above — from customer inquiry through contract, manufacturing or import, delivery, installation, and completion. Application APIs and user-facing workflows are still being built on top of this foundation; not every step is yet available in the software.
