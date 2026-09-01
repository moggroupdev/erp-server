-- Reinterpret quantity_required as entered quantity in unit_of_measurement_selected.
-- Existing BOM rows stored quantity in base unit; convert back where an alternate unit was selected.

UPDATE product_standard_boms AS psb
SET quantity_required = psb.quantity_required / muc.conversion_factor_to_base
FROM materials AS m
INNER JOIN material_unit_conversions AS muc
  ON muc.material_code = psb.material_code
  AND muc.unit = psb.unit_of_measurement_selected
WHERE psb.material_code = m.code
  AND psb.unit_of_measurement_selected IS NOT NULL
  AND psb.unit_of_measurement_selected <> m.unit_of_measurement;

UPDATE manufactured_material_boms AS mmb
SET quantity_required = mmb.quantity_required / muc.conversion_factor_to_base
FROM materials AS m
INNER JOIN material_unit_conversions AS muc
  ON muc.material_code = mmb.material_code
  AND muc.unit = mmb.unit_of_measurement_selected
WHERE mmb.material_code = m.code
  AND mmb.unit_of_measurement_selected IS NOT NULL
  AND mmb.unit_of_measurement_selected <> m.unit_of_measurement;
