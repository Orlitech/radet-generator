-- Pharmacy Report Query - ARV Dispensing Records
SELECT 
    org.name AS facilityName,
    oi.code AS datimId,
    p.uuid AS patientId,
    p.hospital_number AS hospitalNum,
    result.visit_date AS dateVisit,
    hrt.description AS regimenLine,
    result.regimen_name AS regimens,
    result.duration AS refillPeriod,
    result.mmd_type AS mmdType,
    result.next_appointment AS nextAppointment,
    COALESCE(dsd.dsd_model, '') AS dsdModel

FROM (
    SELECT
        h.id,
        h.facility_id,
        h.person_uuid,
        h.mmd_type,
        h.next_appointment,
        h.visit_date,
        (pharmacy_object ->> 'duration')::INTEGER AS duration,
        pharmacy_object ->> 'regimenName' AS regimen_name,
        (pharmacy_object ->> 'regimenId')::BIGINT AS regimen_id

    FROM hiv_art_pharmacy h
    CROSS JOIN jsonb_array_elements(h.extra -> 'regimens') AS pharmacy_object

    WHERE h.archived = 0
      AND h.visit_date IS NOT NULL
) AS result

INNER JOIN patient_person p 
    ON p.uuid = result.person_uuid
    AND p.archived = 0

INNER JOIN base_organisation_unit org 
    ON org.id = result.facility_id

INNER JOIN base_organisation_unit_identifier oi 
    ON oi.organisation_unit_id = result.facility_id 
    AND oi.name = 'DATIM_ID'

INNER JOIN hiv_regimen hr 
    ON hr.id = result.regimen_id

INNER JOIN hiv_regimen_type hrt 
    ON hrt.id = hr.regimen_type_id

-- Latest DSD model for the patient
LEFT JOIN (
    SELECT DISTINCT ON (person_uuid) 
        person_uuid,
        dsd_model
    FROM dsd_devolvement
    WHERE archived = 0
    ORDER BY person_uuid, date_devolved DESC
) dsd ON dsd.person_uuid = p.uuid

WHERE hrt.id IN (1,2,3,4,14,16)  -- Regular ARV regimens only
  AND result.regimen_name IS NOT NULL

ORDER BY 
    p.uuid,
    result.visit_date DESC,
    result.next_appointment DESC