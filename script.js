//Practicing Consol Outputs
console.log("Japan Travel Planner Engine Initilized");

//also counting # of location cards based on div id
let mySavedSpots = document.querySelectorAll('.locations');

// 1. STATE: Our "Database" (Mutable Array of Objects)
let travelLocations = [
    {
        name: "Shibuya Station",
        category: "Anime Landmark (JJK)",
        notes: "Need to find the specific exit from the Shibuya Incident arc. Check for construction.",
        visited: false
    },
    {
        name: "T's Tantan (Tokyo Station)",
        category: "Ovo-Vegetarian",
        notes: "Famous vegan ramen spot. Located inside the Keiyo Street area of the station.",
        visited: false
    },
    {
        name: "Daikoku Futo PA",
        category: "Motorcycle & Car Scene",
        notes: "Legendary car meet spot. Need to figure out transportation.",
        visited: false
    }
];

// 2. DOM REFERENCES: Grabbing our main HTML anchors
let container = document.getElementById('locations-container');
let addButton = document.getElementById('add-btn');

// 3. THE RENDER LOOP: Wipes the screen and redraws based on State
function renderLocations() {
    
    // Create an empty string to hold all our generated HTML
    let allHTML = "";

    // --- LOOP 1: Build the HTML String ---
    for (let i = 0; i < travelLocations.length; i++) {
        let spot = travelLocations[i]; 

        // Conditional Logic: Check state to determine colors and text
        let cardColor = "white";
        let buttonText = "Mark as Visited";

        if (spot.visited === true) {
            cardColor = "#d4edda"; // Light green
            buttonText = "Visited!";
        }

        // Build the HTML template for this specific card
        let cardHTML = `
            <div class="locations" id="card-${i}" style="background-color: ${cardColor};">
                <h3>${spot.name}</h3>
                <p><strong>Category:</strong> ${spot.category}</p>
                <p><strong>Notes:</strong> ${spot.notes}</p>
                <button id="btn-${i}">${buttonText}</button>
            </div>
        `;

        allHTML += cardHTML;
    }

    // Push the massive string to the screen all at once
    container.innerHTML = allHTML;

    // --- LOOP 2: Attach the Event Listeners to the new buttons ---
    for (let i = 0; i < travelLocations.length; i++) {
        
        let button = document.getElementById(`btn-${i}`);
        
        button.addEventListener('click', function() {
            
            // Flip the boolean state in our array
            travelLocations[i].visited = !travelLocations[i].visited;

            // Command the UI engine to repaint the screen
            renderLocations();
            
        });
    }
}

// 4. INITIALIZATION: Call it once so the page draws the initial cards on load
renderLocations();

// 5. USER INPUT: Listen for new locations being added
addButton.addEventListener('click', function() {
    
    // Grab the raw text the user typed
    let nameInput = document.getElementById('new-name').value;
    let categoryInput = document.getElementById('new-category').value;
    let notesInput = document.getElementById('new-notes').value;

    // Build a new object
    let newLocation = {
        name: nameInput,
        category: categoryInput,
        notes: notesInput,
        visited: false
    };

    // Push to the array (like vector.push_back())
    travelLocations.push(newLocation);

    // Command the UI engine to repaint the screen to show the new card
    renderLocations();
    
    // Clear the input boxes so they are empty for the next entry
    document.getElementById('new-name').value = "";
    document.getElementById('new-category').value = "";
    document.getElementById('new-notes').value = "";
});