import numpy as np

def calculate_tsp_route(start_lat, start_lon, hotspots):
    """
    Greedy nearest neighbor TSP solver.
    hotspots: list of dicts with keys 'latitude', 'longitude', 'name', 'count'
    Returns: ordered list of coordinates/locations representing the optimal route.
    """
    if not hotspots:
        return []

    unvisited = hotspots.copy()
    route = []
    
    current_lat = start_lat
    current_lon = start_lon
    
    while unvisited:
        # Find nearest neighbor
        distances = []
        for h in unvisited:
            # Simple Euclidean distance as proxy for short path calculations
            dist = np.sqrt((h['latitude'] - current_lat)**2 + (h['longitude'] - current_lon)**2)
            distances.append(dist)
            
        nearest_idx = np.argmin(distances)
        nearest_hotspot = unvisited.pop(nearest_idx)
        
        route.append(nearest_hotspot)
        current_lat = nearest_hotspot['latitude']
        current_lon = nearest_hotspot['longitude']
        
    return route
