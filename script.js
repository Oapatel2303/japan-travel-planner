// practicing console outputs
console.log("travel planner master engine initialized");

// ==========================================
// ENGINE 0: MASTER DATABASE & ROUTER
// ==========================================

// this variable tracks which folder is open right now. null means we are in the hallway (dashboard)
let activeTripId = null; 

// looking for the master filing cabinet on the hard drive
let savedMaster = localStorage.getItem('myMasterTrips');
let masterTripsArray;

if (savedMaster) {
    masterTripsArray = JSON.parse(savedMaster);

    // --- MIGRATION PATCH ---
    // Make sure old trips have days, destinations, and their locations have days!
    for (let i = 0; i < masterTripsArray.length; i++) {
        
        // Add Days logic to old folders
        if (!masterTripsArray[i].days) {
            masterTripsArray[i].days = 1;
            // Default old locations to Day 1 so they don't break
            masterTripsArray[i].locations.forEach(loc => { 
                if (!loc.day) loc.day = 1; 
            });
        }

        if (!masterTripsArray[i].destination) {
            // hardcoded japan trip fix
            if (masterTripsArray[i].id === "trip_japan") {
                masterTripsArray[i].destination = "japan";
            } 
            // hardcoded france trip fix
            else if (masterTripsArray[i].id === "trip_france") {
                masterTripsArray[i].destination = "france";
            } 
            // for any other old trips, make it blank
            else {
                masterTripsArray[i].destination = ""; 
            }
        }
    }

} else {
    // hardcoding the test dummies (japan and france) to prove the filter works
    masterTripsArray = [
        {
            id: "trip_japan",
            name: "japan 2026",
            destination: "japan",
            dates: "oct 2026",
            days: 3, // <--- NEW
            categories: [
                { name: "vegetarian spots", checked: false },
                { name: "anime landmarks (one piece, jjk)", checked: false },
                { name: "motorcycle & car scene spots", checked: false }
            ],
            locations: [
                { name: "shibuya station", day: 1, category: "anime landmark (jjk)", notes: "need to find the specific exit from the shibuya incident arc.", visited: false, cost: 0, lat: 35.6581, lng: 139.7017 },
                { name: "t's tantan (tokyo station)", day: 2, category: "vegetarian", notes: "famous vegan ramen spot inside keiyo street.", visited: false, cost: 15, lat: 35.6811, lng: 139.7667 },
                { name: "Daikoku Parking Area, Yokohama", day: 3, category: "motorcycle & car scene", notes: "legendary car meet spot.", visited: false, cost: 20, lat: 35.4667, lng: 139.6333 }
            ]
        },
        {
            id: "trip_france",
            name: "france food tour",
            destination: "france",
            dates: "sept 2027",
            days: 1, // <--- NEW
            categories: [
                { name: "bistro classics", checked: false }
            ],
            locations: [
                { name: "le procope", day: 1, category: "bistro classics", notes: "historic restaurant in paris. trying the coq au vin.", visited: false, cost: 45, lat: 48.8530, lng: 2.3386 }
            ]
        }
    ];
}

// 1. GRAB ALL HTML ELEMENTS
let pageWelcome = document.getElementById('page-welcome');
let pageDashboard = document.getElementById('page-dashboard');
let pagePlanner = document.getElementById('page-planner');
let tripListContainer = document.getElementById('trip-list-container');
let currentTripTitle = document.getElementById('current-trip-title');

let btnNewTrip = document.getElementById('btn-new-trip');
let btnLoadTrips = document.getElementById('btn-load-trips');
let btnBack = document.getElementById('btn-back');
let btnHome = document.getElementById('btn-home');

let newTripModal = document.getElementById('new-trip-modal');
let modalCancel = document.getElementById('modal-cancel-btn');
let modalCreate = document.getElementById('modal-create-btn');


// 2. SPA ROUTER LOGIC
btnBack.addEventListener('click', function() {
    pagePlanner.style.display = 'none'; 
    pageDashboard.style.display = 'block'; 
    activeTripId = null;
    
    // force redraw ai chat
    resetChatWidget();

    // force redraw screen when new itinerary is built
    renderDashboard();
});

btnHome.addEventListener('click', function() {
    pageDashboard.style.display = 'none';
    pageWelcome.style.display = 'flex'; // Must be FLEX to center correctly!

    // force redraw ai chat
    resetChatWidget();

    resetWelcomeStage();
});

btnLoadTrips.addEventListener('click', function() {
    pageWelcome.style.display = 'none';
    pageDashboard.style.display = 'block';

    resetWelcomeStage(); // Close modal behind the scenes
    renderDashboard();
});

function resetWelcomeStage() {
    let stage = document.getElementById('welcome-stage');
    let modal = document.getElementById('new-trip-modal');
    stage.classList.remove('modal-active');
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 600);
}

// OPEN MODAL
btnNewTrip.addEventListener('click', function() {
    let stage = document.getElementById('welcome-stage');
    let modal = document.getElementById('new-trip-modal');
    
    modal.style.display = 'block';
    // Small delay allows 'display: block' to register before animation starts
    setTimeout(() => {
        stage.classList.add('modal-active');
        modal.classList.add('show');
    }, 10);
});

// CLOSE MODAL
modalCancel.addEventListener('click', function() {
    resetWelcomeStage();
});


// 3. FACTORY LOGIC (CREATING A FOLDER)
modalCreate.addEventListener('click', function() {
    let rawName = document.getElementById('modal-trip-name').value;
    let rawDest = document.getElementById('modal-trip-dest').value; // <--- GRAB IT
    let rawDates = document.getElementById('modal-trip-dates').value;
    let rawCats = document.getElementById('modal-trip-cats').value;

    if (rawName.trim() === "") {
        alert("yo you need to name the trip first!");
        return;
    }

    if (rawDest.trim() === "") {
        alert("you gotta tell us what country you are going to!");
        return;
    }

    let processedCategories = [];
    if (rawCats.trim() !== "") {
        let splitArray = rawCats.split(',');
        for (let i = 0; i < splitArray.length; i++) {
            let cleanCatName = splitArray[i].trim();
            if (cleanCatName !== "") {
                processedCategories.push({ name: cleanCatName, checked: false });
            }
        }
    }

    let newFolder = {
        id: "trip_" + Date.now(),
        name: rawName,
        destination: rawDest.toLowerCase().trim(),
        dates: rawDates,
        days: 1, // Default new trips to 1 day
        categories: processedCategories,
        locations: [] 
    };

    masterTripsArray.push(newFolder);
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));

    document.getElementById('modal-trip-name').value = "";
    document.getElementById('modal-trip-dest').value = "";
    document.getElementById('modal-trip-dates').value = "";
    document.getElementById('modal-trip-cats').value = "";
    newTripModal.style.display = 'none';

    pageWelcome.style.display = 'none';
    openTrip(newFolder.id); 
});

// draws the trip cards on pg 2
function renderDashboard() {
    // save the whole cabinet to the hard drive
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    
    let dashHTML = "";
    for (let i = 0; i < masterTripsArray.length; i++) {
        let trip = masterTripsArray[i];
        
        // modifying css .locations class
        dashHTML += `
            <div class="locations">
                <h3 style="margin-top: 0;">${trip.name}</h3>
                <p><strong>dates:</strong> ${trip.dates}</p>
                <button onclick="openTrip('${trip.id}')" style="background-color: #2196F3; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">open planner</button>
                <button onclick="deleteTrip('${trip.id}')" style="background-color: #ff4d4d; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; margin-left: 10px;">delete</button>
            </div>
        `;
    }
    tripListContainer.innerHTML = dashHTML;
}

// the context switch logic (the magic)
// uses window. so the inline html onclick button can see it
window.openTrip = function(tripId) {
    activeTripId = tripId; // lock in the current trip id
    
    // find the matching folder in the master array using .find()
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    // change the h2 title on pg 3 dynamically
    currentTripTitle.innerText = currentTrip.name + " itinerary";

    // switch the theater sets
    pageDashboard.style.display = 'none';
    pagePlanner.style.display = 'block';

    // command both engines to draw ONLY the stuff for this specific folder
    activeFilterDay = 0; // Reset filter when opening a folder
    renderDayFilter();
    renderCategories();
    renderLocations();
    fetchCurrencyRate();
    loadWeather();
    initMap();

}


// ==========================================
// ENGINE 0.5: DAY SCHEDULING & FILTERING
// ==========================================
let activeFilterDay = 0; // 0 = All Days, 1 = Day 1, etc.

function renderDayFilter() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    const dayNav = document.getElementById('day-navigation');
    
    let navHTML = "";
    
    // "All" Button
    let allActive = (activeFilterDay === 0) ? "day-btn-active" : "";
    navHTML += `<button onclick="setDayFilter(0)" class="day-btn ${allActive}">All</button>`;

    // Day Buttons
    for (let i = 1; i <= currentTrip.days; i++) {
        let isActive = (activeFilterDay === i) ? "day-btn-active" : "";
        navHTML += `<button onclick="setDayFilter(${i})" class="day-btn ${isActive}">Day ${i}</button>`;
    }

    // Add Day Button
    navHTML += `<button onclick="addDayToTrip()" class="day-btn day-btn-add">+</button>`;
    dayNav.innerHTML = navHTML;
}

window.setDayFilter = function(dayNumber) {
    activeFilterDay = dayNumber;
    renderDayFilter();
    renderLocations();
    renderMapPins(); // Redraws map to only show that day's route!
}

window.addDayToTrip = function() {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    currentTrip.days++;
    renderDayFilter();
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
}


// ==========================================
// ENGINE 1: DYNAMIC CATEGORIES TRACKER
// ==========================================
let catContainer = document.getElementById('categories-container');
let addCatBtn = document.getElementById('add-cat-btn');

function renderCategories() {
    // guard clause: if we aren't inside a trip, don't run this code
    if (!activeTripId) return; 

    // point to the open folder
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    // save master array to hard drive
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    
    let allCatHTML = "";

    // notice we are looping over currentTrip.categories now, not the old array
    for (let i = 0; i < currentTrip.categories.length; i++) {
        let cat = currentTrip.categories[i];
        let isChecked = cat.checked ? "checked" : "";
        let textStyle = cat.checked ? "text-decoration: line-through; color: gray;" : "";

        allCatHTML += `
            <li style="margin-bottom: 10px; display: flex; align-items: center;">
                <input type="checkbox" id="cat-check-${i}" ${isChecked} style="margin-right: 10px;">
                <span style="${textStyle} flex-grow: 1;">${cat.name}</span>
                <button id="cat-del-${i}" style="background-color: #ff4d4d; color: white; padding: 2px 6px; font-size: 12px; margin-left: 10px; border: none; border-radius: 3px; cursor: pointer;">delete</button>
            </li>
        `;
    }
    
    catContainer.innerHTML = allCatHTML;

    // attach listeners
    for (let i = 0; i < currentTrip.categories.length; i++) {
        let checkbox = document.getElementById(`cat-check-${i}`);
        checkbox.addEventListener('change', function() {
            currentTrip.categories[i].checked = checkbox.checked;
            renderCategories();
        });

        let delBtn = document.getElementById(`cat-del-${i}`);
        delBtn.addEventListener('click', function() {
            currentTrip.categories.splice(i, 1);
            renderCategories();
        });
    }
}

// new category listener
addCatBtn.addEventListener('click', function() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    let newCatName = document.getElementById('new-cat-input').value;
    if (newCatName.trim() === "") {
        alert("please enter a category!");
        return;
    }
    
    // push straight into the nested array
    currentTrip.categories.push({ name: newCatName, checked: false });
    renderCategories();
    document.getElementById('new-cat-input').value = "";
});


// ==========================================
// ENGINE 2: LOCATION CARDS (WITH EDIT LOGIC & COMPACT CARDS)
// ==========================================
let container = document.getElementById('locations-container');
let addButton = document.getElementById('add-btn');

// NEW TRACKER: Null means we are adding a new spot. A number means we are editing that specific spot.
let editingIndex = null; 

function renderLocations() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    let allHTML = "";
    let tripTotal = 0; 

    // Sort the array by day FIRST so the cards display in order
    currentTrip.locations.sort((a,b) => a.day - b.day);

    for (let i = 0; i < currentTrip.locations.length; i++) {
        let spot = currentTrip.locations[i]; 

        // THE FILTER CLAUSE: Skip rendering this card if it doesn't match the selected day
        if (activeFilterDay !== 0 && spot.day !== activeFilterDay) {
            continue;
        }

        let cardColor = spot.visited ? "background-color: rgba(76, 175, 80, 0.15);" : ""; 
        let buttonText = spot.visited ? "visited!" : "mark as visited";


        tripTotal += spot.cost || 0; 

        // Removed the hardcoded colors and replaced them with CSS variables
        let cardHTML = `
            <div class="locations" id="card-${i}" style="${cardColor} padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
                    <h3 style="margin: 0; font-size: 1.1em; color: var(--text-color);">
                        <span style="color: var(--accent-color); margin-right: 8px;">[D${spot.day}]</span>${spot.name}
                    </h3>
                    <span style="font-weight: bold; color: var(--success-color);">$${(spot.cost || 0).toFixed(2)}</span>
                </div>
                <p style="margin: 2px 0; font-size: 13px; color: var(--text-color); opacity: 0.8;"><strong>cat:</strong> ${spot.category}</p>
                <p style="margin: 2px 0 10px 0; font-size: 13px; color: var(--text-color);"><strong>notes:</strong> ${spot.notes}</p>
                
                <div style="display: flex; gap: 8px;">
                    <button id="btn-${i}" style="font-size: 12px; padding: 4px 8px;">${buttonText}</button>
                    <button id="edit-btn-${i}" style="font-size: 12px; padding: 4px 8px; background-color: var(--warning-color); border: none; border-radius: 3px; cursor: pointer; color: black;">edit</button>
                    <button id="delete-btn-${i}" style="font-size: 12px; padding: 4px 8px; background-color: var(--danger-color); color: white; border: none; border-radius: 3px; cursor: pointer;">delete</button>
                </div>
            </div>
        `;
        allHTML += cardHTML;
    }

    container.innerHTML = allHTML;

    let budgetDisplay = document.getElementById('budget-display');
    if (budgetDisplay) {
        budgetDisplay.innerText = `total spending: $${tripTotal.toFixed(2)}`;
    }

    // ATTACH LISTENERS FOR ALL BUTTONS
    for (let i = 0; i < currentTrip.locations.length; i++) {
        
        // Check if the button exists in the DOM before adding listener (important because of the filter!)
        let visBtn = document.getElementById(`btn-${i}`);
        if(visBtn) {
            visBtn.addEventListener('click', function() {
                currentTrip.locations[i].visited = !currentTrip.locations[i].visited;
                renderLocations();
            });

            // Delete Button
            document.getElementById(`delete-btn-${i}`).addEventListener('click', function(){
                currentTrip.locations.splice(i,1);
                renderLocations();
                renderMapPins();
                loadWeather();
            });

            // Edit Button
            document.getElementById(`edit-btn-${i}`).addEventListener('click', function(){
                // Suck the data back up into the input boxes
                document.getElementById('new-name').value = currentTrip.locations[i].name;
                document.getElementById('new-day').value = currentTrip.locations[i].day || 1; // Populate the day!
                document.getElementById('new-category').value = currentTrip.locations[i].category;
                document.getElementById('new-notes').value = currentTrip.locations[i].notes;
                document.getElementById('new-price').value = currentTrip.locations[i].cost || "";
                
                editingIndex = i;
                
                addButton.innerText = "update location";
                addButton.style.backgroundColor = "#ffc107";
                addButton.style.color = "black";
                
                document.getElementById('new-name').focus();
            });
        }
    }
}

// --- HELPER: Smart Geocoding Waterfall ---
async function smartGeocode(rawName, country) {
    // 1. Regex Magic: This completely deletes anything inside parentheses () 
    let cleanName = rawName.replace(/ *\([^)]*\) */g, "").trim();
    
    // Grab just the first word as an absolute last resort 
    let firstWord = cleanName.split(" ")[0];

    // 2. The Waterfall Array 
    let searchAttempts = [
        `${rawName}, ${country}`,    
        `${cleanName}, ${country}`,  
        rawName,                     
        cleanName,                   
    ];

    if (firstWord && firstWord.length > 3) {
        searchAttempts.push(`${firstWord}, ${country}`); 
    }

    for (let i = 0; i < searchAttempts.length; i++) {
        let query = searchAttempts[i];
        try {
            let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            let data = await res.json();

            if (data && data.length > 0) {
                console.log(`📍 Success! Found map pin using query: "${query}"`);
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
        } catch (error) {
            console.error(`Geocode error on "${query}":`, error);
        }

        await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.warn("Waterfall exhausted. Could not locate pin.");
    return { lat: 0, lng: 0 };
}

// UPDATED SAVE BUTTON LOGIC (NOW WITH AUTO-GEOCODING AND DAYS)
addButton.addEventListener('click', async function() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    let nameInput = document.getElementById('new-name').value;
    let dayInput = document.getElementById('new-day').value; // GRAB DAY
    let categoryInput = document.getElementById('new-category').value;
    let notesInput = document.getElementById('new-notes').value;
    let priceInput = document.getElementById('new-price').value; 

    if (nameInput.trim() === "") { alert("please enter a location name before saving!"); return; }
    if (categoryInput.trim() === "") { alert("please enter a category type before saving!"); return; }

    let cleanDayNum = parseInt(dayInput) || 1;
    if (cleanDayNum > currentTrip.days) currentTrip.days = cleanDayNum;

    // --- NEW: UX Loading State ---
    let originalBtnText = addButton.innerText;
    addButton.innerText = "locating pin...";
    addButton.disabled = true;

    // --- FIRE THE WATERFALL BRAIN ---
    let coords = await smartGeocode(nameInput, currentTrip.destination);
    let finalLat = coords.lat;
    let finalLng = coords.lng;

    if (finalLat === 0 && finalLng === 0) {
        alert(`Saved to your list! However, the map still couldn't find the exact GPS coordinates for "${nameInput}". It might be too obscure for our map database!`);
    }

    // Build the clean object 
    let newLocation = {
        name: nameInput,
        day: cleanDayNum, // Assign the day
        category: categoryInput,
        notes: notesInput,
        visited: (editingIndex !== null) ? currentTrip.locations[editingIndex].visited : false,
        cost: parseFloat(priceInput) || 0,
        lat: finalLat, 
        lng: finalLng  
    };

    if (editingIndex !== null) {
        currentTrip.locations[editingIndex] = newLocation;
        editingIndex = null; 
        addButton.style.backgroundColor = "var(--success-color)";
        addButton.style.color = "white";
    } else {
        currentTrip.locations.push(newLocation);
    }

    // Reset UI
    addButton.innerText = "save location";
    addButton.disabled = false;
    
    renderDayFilter(); // Update navigation in case a new day was added
    renderLocations();
    renderMapPins();
    loadWeather();
    
    document.getElementById('new-name').value = "";
    document.getElementById('new-day').value = "1"; // Reset to 1
    document.getElementById('new-category').value = "";
    document.getElementById('new-notes').value = "";
    document.getElementById('new-price').value = ""; 
});

// ==========================================
// ENGINE 3: DATA MANAGEMENT (EXPORT/IMPORT/DELETE)
// ==========================================

// 1. DELETE TRIP LOGIC (attached to the inline html button)
window.deleteTrip = function(tripId) {
    let confirmDelete = confirm("yo are you sure you want to delete this entire trip?");
    if (!confirmDelete) return;
    masterTripsArray = masterTripsArray.filter(t => t.id !== tripId);
    renderDashboard();
}

// 2. EXPORT TRIP LOGIC
let btnExport = document.getElementById('btn-export');
btnExport.addEventListener('click', function() {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let saveCode = btoa(JSON.stringify(currentTrip));
    navigator.clipboard.writeText(saveCode).then(function() {
        alert("success! trip code copied to clipboard. text it to your friends!");
    }).catch(function() {
        prompt("your browser blocked the auto-copy. copy it manually here:", saveCode);
    });
});

// 3. IMPORT TRIP LOGIC
let btnImport = document.getElementById('btn-import');
btnImport.addEventListener('click', function() {
    let pastedCode = prompt("paste the trip code here:");
    if (!pastedCode) return; 

    try {
        let importedTrip = JSON.parse(atob(pastedCode));
        importedTrip.id = "trip_" + Date.now();
        masterTripsArray.push(importedTrip);
        renderDashboard();
        alert("trip successfully imported!");
    } catch (error) {
        alert("that code is invalid or corrupted.");
        console.error(error);
    }
});


// ==========================================
// ENGINE 4: EXTERNAL APIS
// ==========================================

// currency API
async function fetchCurrencyRate() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    let rateTextElement = document.getElementById('currency-rate-text');
    if (!rateTextElement) return;

    let destination = currentTrip.destination; 

    try {
        rateTextElement.innerText = "locating..."; 
        rateTextElement.style.color = "#888"; 

        let countryResponse = await fetch(`https://restcountries.com/v3.1/name/${destination}`);
        
        if (!countryResponse.ok) {
            rateTextElement.innerText = "unknown country";
            return;
        }
        
        let countryData = await countryResponse.json();
        let targetCurrency = Object.keys(countryData[0].currencies)[0]; 

        rateTextElement.innerText = "fetching rate...";

        let rateResponse = await fetch('https://open.er-api.com/v6/latest/USD');
        let rateData = await rateResponse.json();
        
        let rate = rateData.rates[targetCurrency];

        if (rate) {
            rateTextElement.innerText = `1 USD = ${rate.toFixed(2)} ${targetCurrency}`;
            rateTextElement.style.color = "var(--success-color)";
            rateTextElement.style.fontWeight = "bold";
            rateTextElement.style.fontSize = "24px"; 
            rateTextElement.style.marginTop = "15px"; 
            rateTextElement.style.display = "block"; 
        } else {
            rateTextElement.innerText = "rate not found";
        }

    } catch (error) {
        console.error("API Error:", error);
        rateTextElement.innerText = "api offline";
    }
}

// weather API
async function loadWeather() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    const weatherText = document.getElementById('weather-text');

    if (!currentTrip || !currentTrip.destination) {
        weatherText.innerText = "no destination";
        return;
    }

    const destination = currentTrip.destination.toLowerCase();
    weatherText.innerText = "scanning regions..."; 

    let finalWeatherHTML = "";
    let locationsToFetch = []; 

    try {
        let countryResponse = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(destination)}`);
        if (countryResponse.ok) {
            let countryData = await countryResponse.json();
            let capital = countryData[0].capital ? countryData[0].capital[0] : destination;
            
            let capGeoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(capital)}&count=1&language=en&format=json`);
            let capGeoData = await capGeoRes.json();
            
            if (capGeoData.results && capGeoData.results.length > 0) {
                locationsToFetch.push({
                    name: capital + " (Capital)",
                    lat: capGeoData.results[0].latitude,
                    lng: capGeoData.results[0].longitude
                });
            }
        }

        let addedCount = 0;
        for (let i = 0; i < currentTrip.locations.length; i++) {
            let spot = currentTrip.locations[i];
            if (spot.lat && spot.lng && spot.lat !== 0) {
                if (addedCount < 2) {
                    locationsToFetch.push({
                        name: spot.name.substring(0, 14) + (spot.name.length > 14 ? "..." : ""), 
                        lat: spot.lat,
                        lng: spot.lng
                    });
                    addedCount++;
                }
            }
        }

        if (locationsToFetch.length === 0) {
             let fallbackRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`);
             let fallbackData = await fallbackRes.json();
             if (fallbackData.results && fallbackData.results.length > 0) {
                 locationsToFetch.push({
                    name: destination,
                    lat: fallbackData.results[0].latitude,
                    lng: fallbackData.results[0].longitude
                 });
             }
        }

        for (let i = 0; i < locationsToFetch.length; i++) {
            let loc = locationsToFetch[i];

            let weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current_weather=true`);
            let weatherData = await weatherResponse.json();

            const weatherCode = weatherData.current_weather.weathercode;
            const tempC = weatherData.current_weather.temperature;
            const tempF = ((tempC * 9/5) + 32).toFixed(1);

            const weatherMap = {
                0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
                45: "🌫️", 48: "🌫️",
                51: "🌧️", 53: "🌧️", 55: "🌧️",
                61: "🌧️", 63: "🌧️", 65: "🌧️",
                71: "🌨️", 73: "🌨️", 75: "🌨️",
                95: "⛈️"
            };

            let emoji = weatherMap[weatherCode] || "🌈";

            finalWeatherHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding: 6px 0;">
                    <span style="font-weight: bold; text-transform: capitalize; font-size: 13px;">${loc.name}</span>
                    <span style="font-size: 13px;">${emoji} ${tempF}°F</span>
                </div>
            `;
        }

        if (finalWeatherHTML === "") {
            weatherText.innerText = "weather unavailable";
        } else {
            weatherText.innerHTML = finalWeatherHTML;
        }

    } catch (error) {
        console.error("Weather API Error:", error);
        weatherText.innerText = "api offline";
    }
}

// ==========================================
// ENGINE 5: UI LIBRARIES
// ==========================================

flatpickr("#modal-trip-dates", {
    mode: "range",
    dateFormat: "M j, Y", 
    minDate: "today",     
    showMonths: 1         
});

// ==========================================
// ENGINE 6: DARK MODE TOGGLE
// ==========================================
let themeToggleBtn = document.getElementById('theme-toggle');

let savedTheme = localStorage.getItem('myAppTheme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggleBtn.innerText = "☀️ Light Mode";
    themeToggleBtn.style.color = "white";
}

themeToggleBtn.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    
    if (document.body.classList.contains('dark-mode')) {
        themeToggleBtn.innerText = "☀️ Light Mode";
        themeToggleBtn.style.color = "white";
        localStorage.setItem('myAppTheme', 'dark');
    } else {
        themeToggleBtn.innerText = "🌙 Dark Mode";
        themeToggleBtn.style.color = "black";
        localStorage.setItem('myAppTheme', 'light');
    }
});

// ==========================================
// ENGINE 7: LEAFLET.JS INTERACTIVE MAP (WITH ROUTING)
// ==========================================
let myMap = null; 

// --- MAP ROUTING MODE ---
let currentRouteMode = "car"; // options: "car", "foot", "bike"

document.querySelectorAll('.route-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.route-btn').forEach(b => b.classList.remove('route-btn-active'));
        this.classList.add('route-btn-active');
        currentRouteMode = this.getAttribute('data-mode');
        renderMapPins(); // Redraw lines when mode changes
    });
});

async function initMap() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    if (myMap !== null) {
        myMap.remove();
        myMap = null;
    }

    const destination = currentTrip.destination;

    try {
        let geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`);
        let geoData = await geoResponse.json();

        let centerLat = 0;
        let centerLng = 0;
        let zoomLevel = 2; 

        if (geoData.results && geoData.results.length > 0) {
            centerLat = geoData.results[0].latitude;
            centerLng = geoData.results[0].longitude;
            zoomLevel = 5; 
        }

        myMap = L.map('map').setView([centerLat, centerLng], zoomLevel);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors, © CARTO'
        }).addTo(myMap);

        L.Control.geocoder({
            position: 'topright'
        }).addTo(myMap);

        renderMapPins();

    } catch (error) {
        console.error("Map initialization failed:", error);
    }
}

// Draws the physical pins and REAL ROAD ROUTE LINES on the Leaflet Map
async function renderMapPins() {
    if (!myMap || !activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    // 1. Wipe the map clean
    myMap.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            myMap.removeLayer(layer);
        }
    });

    let bounds = []; 
    let routeCoords = []; 

    // 2. Filter locations to active day and valid coords
    let visibleSpots = currentTrip.locations.filter(spot => {
        let matchesDay = (activeFilterDay === 0 || spot.day === activeFilterDay);
        let hasCoords = (spot.lat && spot.lng && (spot.lat !== 0 || spot.lng !== 0));
        return matchesDay && hasCoords;
    });

    // 3. NEAREST NEIGHBOR ALGORITHM (Shortest Path Sorting)
    if (visibleSpots.length > 0) {
        let unvisited = [...visibleSpots];
        let currentSpot = unvisited.shift(); 
        drawPin(currentSpot);

        while (unvisited.length > 0) {
            let nearestIndex = 0;
            let shortestDistance = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                let candidate = unvisited[i];
                let dist = myMap.distance([currentSpot.lat, currentSpot.lng], [candidate.lat, candidate.lng]);
                if (dist < shortestDistance) {
                    shortestDistance = dist;
                    nearestIndex = i;
                }
            }

            currentSpot = unvisited.splice(nearestIndex, 1)[0];
            drawPin(currentSpot);
        }
    }

    function drawPin(spot) {
        let marker = L.marker([spot.lat, spot.lng]).addTo(myMap);
        marker.bindPopup(`
            <b style="font-size: 14px;">[Day ${spot.day}] ${spot.name}</b><br>
            <span style="color: gray; font-size: 12px;">${spot.category}</span>
        `);
        bounds.push([spot.lat, spot.lng]);
        routeCoords.push([spot.lat, spot.lng]);
    }

    // 4. ASK OSRM FOR THE REAL DRIVING/WALKING ROUTE
    if (routeCoords.length > 1) {
        try {
            // OSRM needs coordinates formatted as Longitude,Latitude
            let osrmCoords = routeCoords.map(c => `${c[1]},${c[0]}`).join(';');
            
            // NEW: Pointing to the FOSSGIS server which actually supports foot/bike!
            let response = await fetch(`https://routing.openstreetmap.de/routed-${currentRouteMode}/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`);
            let data = await response.json();

            if (data.routes && data.routes.length > 0) {
                // Convert back to Lat/Lng for Leaflet
                let actualRoadShape = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);

                L.polyline(actualRoadShape, {
                    color: '#2196F3',
                    weight: 5,
                    opacity: 0.8,
                    lineJoin: 'round'
                }).addTo(myMap);
            } else {
                throw new Error("OSRM couldn't find a route");
            }

        } catch (error) {
            console.warn("Real road routing failed, falling back to straight lines.", error);
            // FALLBACK: Straight lines if crossing an ocean or OSRM fails
            L.polyline(routeCoords, {
                color: '#2196F3',
                weight: 4,
                opacity: 0.8,
                dashArray: '10, 10',
                lineJoin: 'round'
            }).addTo(myMap);
        }
    }

    // 5. The Camera Director
    if (bounds.length > 0) {
        myMap.fitBounds(bounds, { padding: [50, 50] });
    }
}

// ==========================================
// ENGINE 8: AI CHATBOT UI
// ==========================================
let aiToggleBtn = document.getElementById('ai-toggle-btn');
let aiChatWindow = document.getElementById('ai-chat-window');
let aiCloseBtn = document.getElementById('ai-close-btn');

// Open the chat
aiToggleBtn.addEventListener('click', function() {
    aiChatWindow.style.display = 'flex';
    aiToggleBtn.style.display = 'none'; // Hide the open button
});

// Close the chat
aiCloseBtn.addEventListener('click', function() {
    aiChatWindow.style.display = 'none';
    aiToggleBtn.style.display = 'block'; // Bring back the open button
});

// Wipes the chat clean and minimizes the window
function resetChatWidget() {
    let aiChatHistory = document.getElementById('ai-chat-history');
    let aiChatWindow = document.getElementById('ai-chat-window');
    let aiToggleBtn = document.getElementById('ai-toggle-btn');
    let aiInput = document.getElementById('ai-user-input');

    if (aiChatHistory) {
        // Overwrite everything with just the default starting message
        aiChatHistory.innerHTML = `<div class="chat-message ai-message">Hi! I'm your local guide. What do you want to know about this trip?</div>`;
    }
    
    if (aiInput) aiInput.value = ""; // Clear whatever they were typing
    
    // Close the chat window automatically
    if (aiChatWindow) aiChatWindow.style.display = 'none';
    if (aiToggleBtn) aiToggleBtn.style.display = 'block';
}

// ==========================================
// ENGINE 9: THE AI BRAIN (NETLIFY SERVERLESS INTEGRATION)
// ==========================================

let aiInput = document.getElementById('ai-user-input');
let aiSendBtn = document.getElementById('ai-send-btn');
let aiChatHistory = document.getElementById('ai-chat-history');

// Helper Function: Draws the chat bubbles and parses Markdown
function appendMessage(role, text) {
    let msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message');

    if (role === 'user') {
        msgDiv.classList.add('user-message');
        // Keep user text as plain text for security
        msgDiv.innerText = text; 
    } else {
        msgDiv.classList.add('ai-message');
        
        // Mini Markdown Parser for the AI's response
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Converts **text** to bold
            .replace(/\n/g, '<br>')                           // Converts line breaks
            .replace(/<br>\* /g, '<br>• ')                    // Converts * to bullet points
            .replace(/<br>- /g, '<br>• ');                    // Converts - to bullet points
            
        // Inject the parsed HTML
        msgDiv.innerHTML = formattedText;
    }

    aiChatHistory.appendChild(msgDiv);
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
}

// The Main Brain Function (Now routing through your secure Netlify server!)
async function sendToGroq(userText) {
    // 1. Draw a temporary "Thinking..." bubble so the user knows it's working
    let typingId = "typing-" + Date.now();
    let typingDiv = document.createElement('div');
    typingDiv.classList.add('chat-message', 'ai-message');
    typingDiv.id = typingId;
    typingDiv.innerText = "Thinking...";
    aiChatHistory.appendChild(typingDiv);
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;

    try {
        // 2. CONTEXT INJECTION: Figure out what country the user is currently looking at
        let destContext = "a general vacation";
        if (activeTripId) {
            let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
            if (currentTrip && currentTrip.destination) {
                destContext = `a trip to ${currentTrip.destination}`;
            }
        }

        // 3. Fire the request to YOUR new Netlify middleman
        // Notice we are NOT attaching an API key here anymore!
        const response = await fetch("/.netlify/functions/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [
                    { 
                        role: "system", 
                        content: `You are a helpful, expert local travel guide for ${destContext}. Give specific, highly-rated recommendations. Keep answers under 3 sentences.` 
                    },
                    { 
                        role: "user", 
                        content: userText 
                    }
                ]
            })
        });

        const data = await response.json();
        
        // 4. Delete the "Thinking..." bubble
        document.getElementById(typingId).remove();

        // 5. Check for errors
        if (!response.ok) {
            appendMessage("ai", "Oops, I hit a snag on the server!");
            console.error("Server Error:", data);
            return;
        }

        // 6. Print the real answer to the screen!
        appendMessage("ai", data.choices[0].message.content);

    } catch (error) {
        document.getElementById(typingId).remove();
        appendMessage("ai", "Sorry, my servers seem to be offline right now!");
        console.error("Netlify API Error:", error);
    }
}

// --- BUTTON LISTENERS ---

// When they click the Send button
aiSendBtn.addEventListener('click', function() {
    let text = aiInput.value.trim();
    if (text === "") return; // Don't send empty messages

    // 1. Draw the user's blue bubble
    appendMessage('user', text);
    
    // 2. Clear the input box
    aiInput.value = "";
    
    // 3. Send it to the brain
    sendToGroq(text);
});

// Let them press "Enter" on their keyboard to send
aiInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        aiSendBtn.click();
    }
});

// ==========================================
// ENGINE 10: TRIP ANALYZER
// ==========================================

async function runTripAnalysis() {
    // 1. Check if they have a trip open
    if (!activeTripId) {
        alert("Please open a trip first!");
        return;
    }

    // 2. Grab full data object for current trip
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    // 3. Make sure they have actually added locations
    if (!currentTrip.locations || currentTrip.locations.length === 0) {
        appendMessage("ai", "Your itinerary is empty! Add some spots before I analyze it.");
        return;
    }

    // 4. Send a loading message to the chat widget
    appendMessage("ai", "🔍 Scanning your itinerary for geographic anomalies and pacing issues. Give me a second...");

    try {
        // 5. Send the entire trip object to Netlify function
        const response = await fetch("/.netlify/functions/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                tripData: currentTrip
            })
        });

        const data = await response.json();

        if (!response.ok) {
            appendMessage("ai", "Oops, my analysis engine hit a snag!");
            return;
        }

        // 6. Print the analysis into the chat widget
        appendMessage("ai", "📊 **ITINERARY ANALYSIS** 📊\n\n" + data.choices[0].message.content);

    } catch (error) {
        appendMessage("ai", "Sorry, my servers are unreachable right now!");
        console.error("Analyzer Error:", error);
    }
}

// 7. Attach the function to button
document.getElementById('analyze-btn').addEventListener('click', runTripAnalysis);

// INITIALIZATION
renderDashboard();