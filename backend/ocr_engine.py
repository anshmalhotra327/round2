import re
import random

# Karnataka RTO codes
KA_RTOS = ["01", "02", "03", "04", "05", "19", "51", "53", "09", "12", "14", "22", "41", "50"]

def simulate_ocr(image_filename):
    """
    Simulates license plate recognition from an image.
    If the image filename contains a plate pattern, it extracts it.
    Otherwise, it generates a realistic Karnataka license plate.
    """
    # Look for patterns like KA01MC1234 or similar in filename
    clean_name = image_filename.upper()
    plate_match = re.search(r'[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}', clean_name)
    
    if plate_match:
        plate = plate_match.group(0)
    else:
        # Generate a random Karnataka license plate
        rto = random.choice(KA_RTOS)
        letters = "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=2))
        numbers = "".join(random.choices("0123456789", k=4))
        plate = f"KA{rto}{letters}{numbers}"
        
    # Introduce random OCR confidence
    confidence = round(random.uniform(85.0, 99.8), 1)
    
    # Assess mock image quality
    brightness = random.choice(["Optimal", "Adequate", "Low Brightness"])
    blur = random.choice(["No Blur", "Low Blur", "Moderate Blur"])
    
    is_valid = confidence > 90.0 and blur != "Moderate Blur"
    
    return {
        "license_plate": plate,
        "confidence": confidence,
        "image_quality": {
            "brightness": brightness,
            "blur": blur,
            "status": "Pass" if is_valid else "Warning (Low Quality)"
        },
        "auto_fill_data": {
            "vehicle_type": random.choice(["CAR", "SCOOTER", "PASSENGER AUTO", "MOTOR CYCLE"]),
            "violation_type": random.choice(["WRONG PARKING", "NO PARKING", "PARKING ON FOOTPATH"])
        }
    }
