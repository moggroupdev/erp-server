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
- Sales offers (quotations) with line pricing, validity period, status, and optional blanket discount negotiation (round log before acceptance)
- Contracts — the confirmed order — preserving the trail from inquiry through preview and offer, along with delivery address, expected delivery time, and work-order start date

### Products & Engineering

- Product catalog organized by category; each product is either manufactured in-house or imported from a supplier
- Multiple dimension variants per product (length, depth, height, unit), with one marked as default; estimated production time and a pricing factor (multiplier on standard BOM cost) are set at the product level
- Customer-specific sizes are added as new rows in `product_dimensions` and get their own standard material recipe prepared when needed by the Technical Office
- Individual product units created for each contract line, each with its own serial number

### Manufacturing

- Production plans scheduling work over a date range
- Per-product production routing: each manufactured product defines an ordered sequence of production sub-departments (cutting, bending, refrigeration, electricity, gas, injection, sheet metal, blacksmithing, and others) with completion-percentage weights that sum to 100%
- Production sub-department managers and deputy managers assigned per work-center (enum-identified; labels are a frontend concern)
- Work broken down per product unit and production sub-department step, with sequential completion gating
- Progress notes and completion tracking per sub-department step

### Inventory & Warehouse

- Raw materials and spare parts with stock levels and minimum thresholds
- Inventory movements: receipts from purchase inspection, issues to production or maintenance, and returns
- Material issues linked to the production work or maintenance spare-part lines consuming them

### Procurement

- Approved suppliers with contact details and addresses
- Material purchasing: purchase orders, goods receipt, quality inspection with accepted and rejected quantities, and stock intake; purchase lines may optionally be attributed to the contract line(s) driving the demand
- Product purchasing: orders and receipts for imported equipment tied to contract lines, registering each received unit with vendor serial numbers where applicable
- Quotation request emails sent to vendors when sourcing materials

### Delivery & Installation

- Each delivery and installation belongs to one contract; the site address is the contract's `delivery_address_id` (not stored on the task)
- Trips group deliveries, installations, and maintenance orders that travel together on the same vehicle across multiple addresses
- Installation scheduling and assignment for on-site commissioning
- Customer receptions: formal handover when the customer receives product units (factory pickup, after delivery, or after installation); starts the 1-year warranty period per unit
- Contract completion when the project is finished or cancelled

### Maintenance & Service Contracts

- Service agreements: recurring maintenance contracts per customer address (monthly, quarterly, semi-annual, or annual intervals)
- Maintenance orders: in-warranty, out-of-warranty, or service-contract work on one or more product units; performed on-site at the customer or in-factory
- Spare parts consumed during maintenance with selling-price snapshots; customer is billed for parts except in-warranty work not caused by misuse

### Organization & Access

- User accounts with role-based permissions
- Department hierarchy for org-chart departments (Administration, HR, Finance, Production, and others) with optional parent-child structure and department managers
- Production staff belong to the Production org-chart department and are additionally assigned to one of fixed production sub-departments (work-centers)

---

## End-to-End Business Process

The following describes how a typical project moves through the company, from first contact to completion.

### Sales and Discovery

A project begins when a customer reaches out requesting equipment and pricing. The company opens an inquiry and records the products and quantities the customer is interested in.

When a site visit is needed, the Preview Team schedules a preview, assigns staff, and visits the customer's location. They take measurements, assess installation constraints, and capture technical requirements — typically one preview line per inquiry product, copied at scheduling time as a standalone snapshot (same pattern as offer and contract lines). When multiple site visits travel on the same vehicle, they can be grouped into a trip.

With preview findings in hand, the Sales Team prepares a quotation — an offer with line-level pricing and a validity period — and sends it to the customer. If the customer counters on price, sales records negotiation rounds (blanket discount) until terms are agreed. If the customer accepts, a contract is created. This is the confirmed order: it carries the agreed products, prices, delivery address, and expected delivery time, and it remains linked to the original inquiry, preview, and offer for full traceability. When production or fulfillment work begins, the contract's work-order start date (`started_at`) is recorded.

### Order Breakdown

Once a contract is in place, the company breaks each active line item into individual product units — one serial-numbered physical item per unit ordered. Contract lines are immutable once written: adding a line, removing one, or changing quantity, dimension variant, price, or product cancels the existing line (preserving who cancelled it and why) and, when the change is an amendment rather than a removal, creates a replacement line linked back via `previous_version_id`. From this point, manufactured and imported products follow different paths through the company.

### Engineering and Manufacturing

For items built in-house, the Technical Office prepares the standard BOMs for each dimension variant. Actual material costs are tracked through inventory transactions when materials are issued from the warehouse to the production floor.

Production then builds a plan that schedules each unit across the product's configured production sub-departments — cutting, bending, sheet metal, refrigeration, electrical, and so on — in the order and completion weights defined on the product. Progress is tracked per unit and per sub-department step, with sequential gating so a step cannot be completed before the prior one. Manager and deputy manager are assigned per sub-department work-center.

### Materials and Warehouse

Before and during production, the Warehouse checks whether the required raw materials are in stock. When stock is short, Purchasing raises material purchase orders with approved suppliers. Upon arrival, materials are inspected; accepted quantities are received into inventory, while rejected quantities are recorded separately.

Materials are then issued from the warehouse to the production floor, linked to the specific production work consuming them.

### Sourcing Imported Products

For catalog items sourced from outside suppliers rather than built in-house, Purchasing places product purchase orders tied to the relevant contract lines. When goods arrive, each unit is received and registered — including the supplier's serial number where applicable — and linked back to the contract.

### Delivery, Installation, and Completion

Whether a unit was manufactured internally or received from a supplier, it eventually moves toward the customer. Each delivery and installation is tied to one contract; the visit address comes from that contract's delivery address. When multiple tasks travel on the same vehicle, they are grouped into a trip — a preview, delivery, installation, or maintenance visit to different addresses can share one trip.

Customer reception is recorded separately when the customer physically receives units — at the factory, after delivery, or after installation. That handover starts the 1-year warranty period for each unit. When every item is received and the project is accepted, the contract is marked complete.

### After-Sales Maintenance

Once equipment is in the field, the company services it under three arrangements: in-warranty repair, out-of-warranty paid service, or a recurring service contract tied to a customer address. Maintenance orders may cover multiple units in one visit, performed on-site or with the product brought into the factory. Spare parts issued from inventory are recorded with a price snapshot; whether the customer is charged is set per line when adding spare parts.

---

## Current Scope

The data model covers the full project lifecycle described above — from customer inquiry through contract, manufacturing or import, delivery, installation, completion, and after-sales maintenance. Application APIs and user-facing workflows are still being built on top of this foundation; not every step is yet available in the software.
