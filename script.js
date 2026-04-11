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
    // default it to an empty string so the API just safely says "unknown" instead of crashing.
    for (let i = 0; i < masterTripsArray.length; i++) {
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
            categories: [
                { name: "vegetarian spots", checked: false },
                { name: "anime landmarks (one piece, jjk)", checked: false },
                { name: "motorcycle & car scene spots", checked: false }
            ],
            locations: [
                { name: "shibuya station", category: "anime landmark (jjk)", notes: "need to find the specific exit from the shibuya incident arc.", visited: false, cost: 0 },
                { name: "t's tantan (tokyo station)", category: "vegetarian", notes: "famous vegan ramen spot inside keiyo street.", visited: false, cost: 15 },
                { name: "daikoku futo pa", category: "motorcycle & car scene", notes: "legendary car meet spot.", visited: false, cost: 20 }
            ]
        },
        {
            id: "trip_france",
            name: "france food tour",
            destination: "france",
            dates: "sept 2027",
            categories: [
                { name: "bistro classics", checked: false }
            ],
            locations: [
                { name: "le procope", category: "bistro classics", notes: "historic restaurant in paris. trying the coq au vin.", visited: false, cost: 45 }
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

    // force redraw screen when new itinerary is built
    renderDashboard();
});

btnHome.addEventListener('click', function() {
    pageDashboard.style.display = 'none';
    pageWelcome.style.display = 'block';
});

btnLoadTrips.addEventListener('click', function() {
    pageWelcome.style.display = 'none';
    pageDashboard.style.display = 'block';

    // just incase of user adds trip, goes home, and then back to loaded screen.
    renderDashboard();
});

btnNewTrip.addEventListener('click', function() {
    newTripModal.style.display = 'block';
});

modalCancel.addEventListener('click', function() {
    newTripModal.style.display = 'none';
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
    renderCategories();
    renderLocations();
    fetchCurrencyRate();
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

    for (let i = 0; i < currentTrip.locations.length; i++) {
        let spot = currentTrip.locations[i]; 
        let cardColor = "white";
        let buttonText = "mark as visited";

        if (spot.visited === true) {
            cardColor = "#d4edda";
            buttonText = "visited!";
        }

        tripTotal += spot.cost || 0; 

        // THIS HTML IS MUCH MORE COMPACT
        let cardHTML = `
            <div class="locations" id="card-${i}" style="background-color: ${cardColor}; padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
                    <h3 style="margin: 0; font-size: 1.1em;">${spot.name}</h3>
                    <span style="font-weight: bold; color: #4CAF50;">$${(spot.cost || 0).toFixed(2)}</span>
                </div>
                <p style="margin: 2px 0; font-size: 13px; color: #555;"><strong>cat:</strong> ${spot.category}</p>
                <p style="margin: 2px 0 10px 0; font-size: 13px;"><strong>notes:</strong> ${spot.notes}</p>
                
                <div style="display: flex; gap: 8px;">
                    <button id="btn-${i}" style="font-size: 12px; padding: 4px 8px;">${buttonText}</button>
                    <button id="edit-btn-${i}" style="font-size: 12px; padding: 4px 8px; background-color: #ffc107; border: none; border-radius: 3px; cursor: pointer;">edit</button>
                    <button id="delete-btn-${i}" style="font-size: 12px; padding: 4px 8px; background-color: #ff4d4d; color: white; border: none; border-radius: 3px; cursor: pointer;">delete</button>
                </div>
            </div>
        `;
        allHTML += cardHTML;
    }

    container.innerHTML = allHTML;

    let budgetDisplay = document.getElementById('budget-display');
    if (budgetDisplay) {
        budgetDisplay.innerText = `total budget: $${tripTotal.toFixed(2)}`;
    }

    // ATTACH LISTENERS FOR ALL BUTTONS
    for (let i = 0; i < currentTrip.locations.length; i++) {
        // Visited Button
        document.getElementById(`btn-${i}`).addEventListener('click', function() {
            currentTrip.locations[i].visited = !currentTrip.locations[i].visited;
            renderLocations();
        });

        // Delete Button
        document.getElementById(`delete-btn-${i}`).addEventListener('click', function(){
            currentTrip.locations.splice(i,1);
            renderLocations();
        });

        // NEW: Edit Button
        document.getElementById(`edit-btn-${i}`).addEventListener('click', function(){
            // 1. Suck the data back up into the input boxes
            document.getElementById('new-name').value = currentTrip.locations[i].name;
            document.getElementById('new-category').value = currentTrip.locations[i].category;
            document.getElementById('new-notes').value = currentTrip.locations[i].notes;
            document.getElementById('new-price').value = currentTrip.locations[i].cost || "";
            
            // 2. Set the tracker to this card's ID
            editingIndex = i;
            
            // 3. Change the button text and color to show we are in edit mode
            addButton.innerText = "update location";
            addButton.style.backgroundColor = "#ffc107";
            addButton.style.color = "black";
            
            // 4. Scroll the user up to the input boxes
            document.getElementById('new-name').focus();
        });
    }
}

// UPDATED SAVE BUTTON LOGIC
addButton.addEventListener('click', function() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    let nameInput = document.getElementById('new-name').value;
    let categoryInput = document.getElementById('new-category').value;
    let notesInput = document.getElementById('new-notes').value;
    let priceInput = document.getElementById('new-price').value; 

    if (nameInput.trim() === "") { alert("please enter a location name before saving!"); return; }
    if (categoryInput.trim() === "") { alert("please enter a category type before saving!"); return; }

    let newLocation = {
        name: nameInput,
        category: categoryInput,
        notes: notesInput,
        visited: (editingIndex !== null) ? currentTrip.locations[editingIndex].visited : false, // Keep visited status if editing
        cost: parseFloat(priceInput) || 0 
    };

    if (editingIndex !== null) {
        // WE ARE UPDATING AN OLD SPOT
        currentTrip.locations[editingIndex] = newLocation;
        editingIndex = null; // Reset the tracker
        addButton.innerText = "save location"; // Reset the button
        addButton.style.backgroundColor = "#4CAF50";
        addButton.style.color = "white";
    } else {
        // WE ARE SAVING A BRAND NEW SPOT
        currentTrip.locations.push(newLocation);
    }

    renderLocations();
    
    // Clear boxes
    document.getElementById('new-name').value = "";
    document.getElementById('new-category').value = "";
    document.getElementById('new-notes').value = "";
    document.getElementById('new-price').value = ""; 
});

// ==========================================
// ENGINE 3: DATA MANAGEMENT (EXPORT/IMPORT/DELETE)
// ==========================================

// 1. DELETE TRIP LOGIC (attached to the inline html button)
window.deleteTrip = function(tripId) {
    // guard clause to make sure they didnt click it by accident
    let confirmDelete = confirm("yo are you sure you want to delete this entire trip?");
    if (!confirmDelete) return;

    // filter out the deleted trip and overwrite the master array
    masterTripsArray = masterTripsArray.filter(t => t.id !== tripId);
    
    // redraw the dashboard (which auto-saves to local storage!)
    renderDashboard();
}

// 2. EXPORT TRIP LOGIC
let btnExport = document.getElementById('btn-export');
btnExport.addEventListener('click', function() {
    // grab the folder we are currently looking at
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    // turn it into a string and scramble it into base64
    let saveCode = btoa(JSON.stringify(currentTrip));
    
    // copy to clipboard
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
    if (!pastedCode) return; // they hit cancel

    try {
        // unscramble and parse the code back into a javascript object
        let importedTrip = JSON.parse(atob(pastedCode));
        
        // give it a brand new unique id so it doesn't conflict if you import it twice
        importedTrip.id = "trip_" + Date.now();
        
        // shove it into the filing cabinet and redraw the screen
        masterTripsArray.push(importedTrip);
        renderDashboard();
        
        alert("trip successfully imported!");
    } catch (error) {
        alert("that code is invalid or corrupted.");
        console.error(error);
    }
});

// new location listener (UPDATED TO GRAB PRICE)
addButton.addEventListener('click', function() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    let nameInput = document.getElementById('new-name').value;
    let categoryInput = document.getElementById('new-category').value;
    let notesInput = document.getElementById('new-notes').value;
    let priceInput = document.getElementById('new-price').value; // <--- GRABS THE PRICE

    if (nameInput.trim() === "") {
        alert("please enter a location name before saving!");
        return; 
    }

    if (categoryInput.trim() === "") {
        alert("please enter a category type before saving!");
        return; 
    }

    let newLocation = {
        name: nameInput,
        category: categoryInput,
        notes: notesInput,
        visited: false,
        cost: parseFloat(priceInput) || 0 // <--- SAVES THE PRICE AS A MATH NUMBER
    };

    currentTrip.locations.push(newLocation);
    renderLocations();
    
    document.getElementById('new-name').value = "";
    document.getElementById('new-category').value = "";
    document.getElementById('new-notes').value = "";
    document.getElementById('new-price').value = ""; // <--- CLEARS THE PRICE BOX
});

// ==========================================
// ENGINE 4: EXTERNAL APIS
// ==========================================
async function fetchCurrencyRate() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    // Grab the bullseye  set up earlier
    let rateTextElement = document.getElementById('currency-rate-text');
    if (!rateTextElement) return;

    // Grab the clean destination
    let destination = currentTrip.destination; 

    try {
        rateTextElement.innerText = "locating..."; 
        rateTextElement.style.color = "#888"; 

        // WAIT 1: Ask REST Countries for the specific currency code
        let countryResponse = await fetch(`https://restcountries.com/v3.1/name/${destination}`);
        
        if (!countryResponse.ok) {
            rateTextElement.innerText = "unknown country";
            return;
        }
        
        let countryData = await countryResponse.json();
        let targetCurrency = Object.keys(countryData[0].currencies)[0]; // e.g., "JPY" or "EUR"

        rateTextElement.innerText = "fetching rate...";

        // WAIT 2: Ask the Exchange Rate API for the live math
        let rateResponse = await fetch('https://open.er-api.com/v6/latest/USD');
        let rateData = await rateResponse.json();
        
        let rate = rateData.rates[targetCurrency];

        if (rate) {
            rateTextElement.innerText = `1 USD = ${rate.toFixed(2)} ${targetCurrency}`;
            rateTextElement.style.color = "#4CAF50"; // Green for success
            rateTextElement.style.fontWeight = "bold";
        } else {
            rateTextElement.innerText = "rate not found";
        }

    } catch (error) {
        console.error("API Error:", error);
        rateTextElement.innerText = "api offline";
    }
}

// INITIALIZATION
// run this once to draw the dashboard the second you open the website
renderDashboard();