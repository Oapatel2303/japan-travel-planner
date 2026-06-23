// ==========================================
// GLOBAL HTML ELEMENTS
// ==========================================
let pageWelcome = document.getElementById('page-welcome');
let pageDashboard = document.getElementById('page-dashboard');
let pageProfile = document.getElementById('page-profile');
let pagePlanner = document.getElementById('page-planner');

let btnProfile = document.getElementById('btn-profile');
let btnBackProfile = document.getElementById('btn-back-profile');
let btnSaveProfile = document.getElementById('btn-save-profile');

let tripListContainer = document.getElementById('trip-list-container');
let currentTripTitle = document.getElementById('current-trip-title');

let btnNewTrip = document.getElementById('btn-new-trip');
let btnLoadTrips = document.getElementById('btn-load-trips');
let btnBack = document.getElementById('btn-back');
let btnHome = document.getElementById('btn-home');

let newTripModal = document.getElementById('new-trip-modal');
let modalCancel = document.getElementById('modal-cancel-btn');
let modalCreate = document.getElementById('modal-create-btn');


// ==========================================
// ENGINE 000: SUPABASE AUTHENTICATION
// ==========================================
const supabaseUrl = 'https://jdzdezoqcabdluhbgudx.supabase.co';
const supabaseKey = 'sb_publishable_lMb4crV10pWKRx3y21_S6g_9_ArbBfE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null; 

const authStatusBtn = document.getElementById('auth-status-btn');
const authModal = document.getElementById('auth-modal');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authErrorMsg = document.getElementById('auth-error-msg');

authStatusBtn.addEventListener('click', () => {
    if (currentUser) {
        authStatusBtn.innerText = "Logging out...";
        for (let key in localStorage) {
            if (key.startsWith('sb-')) localStorage.removeItem(key);
        }
        supabaseClient.auth.signOut().finally(() => { window.location.reload(); });
    } else {
        authModal.style.display = 'block';
    }
});

document.getElementById('btn-close-auth').addEventListener('click', () => {
    authModal.style.display = 'none';
    authErrorMsg.style.display = 'none';
});

document.getElementById('btn-signup').addEventListener('click', async () => {
    authErrorMsg.style.display = 'none';
    const { error } = await supabaseClient.auth.signUp({ email: authEmail.value, password: authPassword.value });
    if (error) { authErrorMsg.innerText = error.message; authErrorMsg.style.display = 'block'; } 
    else { alert("Account created! You are now logged in."); authModal.style.display = 'none'; }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    authErrorMsg.style.display = 'none';
    const { error } = await supabaseClient.auth.signInWithPassword({ email: authEmail.value, password: authPassword.value });
    if (error) { authErrorMsg.innerText = error.message; authErrorMsg.style.display = 'block'; } 
    else { authModal.style.display = 'none'; }
});

async function initializeUserSession(session) {
    if (!session) {
        currentUser = null;
        authStatusBtn.innerText = "Log In / Sign Up";
        authStatusBtn.style.background = "var(--card-bg)";
        authStatusBtn.style.color = "var(--text-color)";
        btnProfile.style.display = 'none';

        // FORCE SCREEN ROUTING BACK TO HOME
        pageProfile.style.display = 'none';
        pageDashboard.style.display = 'none';
        pagePlanner.style.display = 'none';
        pageWelcome.style.display = 'flex';
        resetWelcomeStage();

        localStorage.removeItem('myMasterTrips');
        masterTripsArray = [
            {
                id: "trip_japan", name: "japan 2026", destination: "japan", dates: "oct 2026", days: 3, owner_id: "dummy",
                categories: [{ name: "vegetarian spots", checked: false }, { name: "anime landmarks", checked: false }],
                locations: [{ name: "shibuya station", day: 1, category: "anime landmark", notes: "shibuya incident arc.", visited: false, cost: 0, lat: 35.6581, lng: 139.7017 }]
            }
        ];
        renderDashboard();
        return;
    }

    // Prevent double-fetching if the session is already anchored
    if (currentUser && currentUser.id === session.user.id) return; 

    currentUser = session.user;
    authStatusBtn.innerText = "Log Out";
    authStatusBtn.style.background = "var(--danger-color)";
    authStatusBtn.style.color = "white";
    console.log("User session anchored:", currentUser.email);

    btnProfile.style.display = 'block';
    if (pageWelcome.style.display !== 'none') {
        pageWelcome.style.display = 'none';
        pageDashboard.style.display = 'block';
    }

    const { data: ownedTrips } = await supabaseClient.from('trips').select('*').eq('user_id', currentUser.id);
    const { data: collabRecords } = await supabaseClient.from('trip_collaborators').select('trip_id').eq('user_id', currentUser.id);

    let sharedTrips = [];
    if (collabRecords && collabRecords.length > 0) {
        let tripIds = collabRecords.map(r => r.trip_id);
        const { data: collabs } = await supabaseClient.from('trips').select('*').in('id', tripIds);
        if (collabs) sharedTrips = collabs;
    }

    let allTrips = [...(ownedTrips || []), ...sharedTrips];

    if (allTrips.length > 0) {
        masterTripsArray = allTrips.map(row => {
            return { id: row.id, owner_id: row.user_id, ...row.trip_data };
        });
    } else {
        masterTripsArray = [];
    }
    
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    renderDashboard();
}

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    initializeUserSession(session);
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        initializeUserSession(session);
    }
});

async function syncTripToCloud(tripObject, isDelete = false) {
    if (!currentUser) return; 

    if (isDelete) {
        await supabaseClient.from('trip_events').delete().eq('trip_id', tripObject.id);
        const { error } = await supabaseClient.from('trips').delete().eq('id', tripObject.id);
        if (error) console.error("Cloud delete failed:", error);
        return;
    }

    // 1. LEGACY WRITE
    const payload = {
        id: tripObject.id,
        user_id: tripObject.owner_id || currentUser.id, 
        trip_data: { 
            name: tripObject.name, 
            destination: tripObject.destination, 
            dates: tripObject.dates, 
            days: tripObject.days, 
            categories: tripObject.categories, 
            locations: tripObject.locations 
        }
    };

    const isOwner = !tripObject.owner_id || tripObject.owner_id === currentUser.id;
    let syncError;

    if (isOwner) {
        const { error } = await supabaseClient.from('trips').upsert(payload);
        syncError = error;
    } else {
        const { error } = await supabaseClient.from('trips').update({ trip_data: payload.trip_data }).eq('id', tripObject.id);
        syncError = error;
    }

    if (syncError) {
        console.error("Cloud sync failed:", syncError);
        return; 
    } 
    
    console.log(`☁️ Legacy JSON for '${tripObject.name}' successfully synced.`);

    // 2. building new database
    if (tripObject.locations && tripObject.locations.length > 0) {
        try {
            await supabaseClient.from('trip_events').delete().eq('trip_id', tripObject.id);

            const eventsPayload = tripObject.locations.map((loc, index) => {
                return {
                    trip_id: tripObject.id,
                    type: 'activity', 
                    name: loc.name,
                    day_number: loc.day || 1,
                    order_index: index,
                    lat: loc.lat,
                    lng: loc.lng,
                    cost_amount: loc.cost || 0,
                    cost_currency: 'USD', 
                    details: {
                        notes: loc.notes,
                        category: loc.category,
                        visited: loc.visited,
                        imageUrl: loc.imageUrl
                    }
                };
            });

            const { error: shadowError } = await supabaseClient.from('trip_events').insert(eventsPayload);
            if (shadowError) console.error("Shadow write to trip_events failed:", shadowError);
            else console.log(`☁️ Shadow DB updated with ${eventsPayload.length} events!`);

        } catch (err) {
            console.error("Error during shadow sync:", err);
        }
    }
}

// ==========================================
// ENGINE 0.2: TRIP SETTINGS EDITOR
// ==========================================
let editTripModal = document.getElementById('edit-trip-modal');
let editDestGeocodeTimer;

document.getElementById('btn-edit-trip').addEventListener('click', () => {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    document.getElementById('edit-trip-name').value = currentTrip.name;
    document.getElementById('edit-trip-dates').value = currentTrip.dates;
    document.getElementById('edit-trip-dest').value = currentTrip.destination;
    editTripModal.style.display = 'block';
});

document.getElementById('btn-close-edit-trip').addEventListener('click', () => {
    editTripModal.style.display = 'none';
});

const editDestInput = document.getElementById('edit-trip-dest');
const editDestDropdown = document.getElementById('edit-dest-autocomplete');

editDestInput.addEventListener('input', (e) => {
    clearTimeout(editDestGeocodeTimer);
    let query = e.target.value.trim();
    if (query.length < 3) { editDestDropdown.style.display = 'none'; return; }

    editDestGeocodeTimer = setTimeout(async () => {
        try {
            let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&types=place,region,country&limit=5`;
            let res = await fetch(url);
            let data = await res.json();

            editDestDropdown.innerHTML = "";
            if (data.features && data.features.length > 0) {
                data.features.forEach(place => {
                    let div = document.createElement('div');
                    div.style.cssText = "padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-color);";
                    div.innerHTML = `<strong>${place.text}</strong> <br><span style="color: gray; font-size: 11px;">${place.place_name}</span>`;
                    div.onmouseover = () => div.style.background = "rgba(33, 150, 243, 0.15)";
                    div.onmouseout = () => div.style.background = "transparent";
                    div.onclick = () => {
                        editDestInput.value = place.place_name;
                        editDestDropdown.style.display = 'none';
                    };
                    editDestDropdown.appendChild(div);
                });
                editDestDropdown.style.display = 'block';
            }
        } catch (err) { console.error("Edit Dest Autocomplete failed:", err); }
    }, 300);
});

// Save logic: Rebuilds timeline and updates backend
document.getElementById('btn-save-edit-trip').addEventListener('click', () => {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let newName = document.getElementById('edit-trip-name').value.trim();
    let newDates = document.getElementById('edit-trip-dates').value.trim();
    let newDest = document.getElementById('edit-trip-dest').value.trim().toLowerCase();

    if (!newName || !newDest) return alert("Trip Name and Destination are required.");

    let calculatedDays = 1;
    if (newDates.includes(" to ")) {
        let parts = newDates.split(" to ");
        let d1 = new Date(parts[0]);
        let d2 = new Date(parts[1]);
        let diffTime = Math.abs(d2 - d1);
        calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    currentTrip.name = newName;
    currentTrip.dates = newDates;
    currentTrip.destination = newDest;
    currentTrip.days = calculatedDays;

    document.getElementById('current-trip-title').innerText = currentTrip.name + " itinerary";
    editTripModal.style.display = 'none';

    // Trigger mass re-render
    renderDayFilter();
    renderLocations();
    fetchCurrencyRate();
    loadWeather();   
    syncTripToCloud(currentTrip);
});

// ==========================================
// ENGINE 00.5: USER PROFILE SYSTEM
// ==========================================

function formatDate(dateString, dayNumber) {
    if (!dateString) return `Day ${dayNumber}`;
    let startDateStr = dateString.split(" to ")[0];
    let dateObj = new Date(startDateStr);
    if (isNaN(dateObj)) return `Day ${dayNumber}`;
    
    dateObj.setDate(dateObj.getDate() + (dayNumber - 1));

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let dateNum = dateObj.getDate();
    let suffix = "th";
    if (dateNum % 10 === 1 && dateNum !== 11) suffix = "st";
    else if (dateNum % 10 === 2 && dateNum !== 12) suffix = "nd";
    else if (dateNum % 10 === 3 && dateNum !== 13) suffix = "rd";

    return `${days[dateObj.getDay()]}, ${months[dateObj.getMonth()]} ${dateNum}${suffix}`;
}

function getShortDate(dateString, dayNumber) {
    if (!dateString) return `Day ${dayNumber}`;
    let startDateStr = dateString.split(" to ")[0];
    let dateObj = new Date(startDateStr);
    if (isNaN(dateObj)) return `Day ${dayNumber}`;
    
    dateObj.setDate(dateObj.getDate() + (dayNumber - 1));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return `Day ${dayNumber} (${months[dateObj.getMonth()]} ${dateObj.getDate()})`;
}

document.getElementById('profile-avatar-preview').addEventListener('error', function() {
    this.src = "https://ui-avatars.com/api/?name=User&background=random";
});

btnProfile.addEventListener('click', async () => {
    pageDashboard.style.display = 'none';
    pagePlanner.style.display = 'none';
    pageWelcome.style.display = 'none';
    pageProfile.style.display = 'block';

    if (currentUser) {
        document.getElementById('profile-display-email').innerText = currentUser.email;
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();

        if (data) {
            document.getElementById('profile-username').value = data.username || "";
            document.getElementById('profile-avatar-url').value = data.avatar_url || "";
            document.getElementById('profile-style').value = data.travel_style || "";
            if (data.avatar_url) document.getElementById('profile-avatar-preview').src = data.avatar_url;
        } else {
            document.getElementById('profile-username').value = "";
            document.getElementById('profile-avatar-url').value = "";
            document.getElementById('profile-style').value = "";
            document.getElementById('profile-avatar-preview').src = "https://ui-avatars.com/api/?name=User&background=random";
        }

        renderSocialDashboard();
    }
});

btnBackProfile.addEventListener('click', () => {
    pageProfile.style.display = 'none';
    pageDashboard.style.display = 'block';
});

btnSaveProfile.addEventListener('click', async () => {
    let usernameVal = document.getElementById('profile-username').value;
    let avatarVal = document.getElementById('profile-avatar-url').value.trim();
    let styleVal = document.getElementById('profile-style').value;

    // clean BBCode tags
    avatarVal = avatarVal.replace(/\[img\]/gi, '').replace(/\[\/img\]/gi, '').trim();

    // Force Imgur auto-fix
    if (avatarVal.includes("imgur.com") && !avatarVal.includes("i.imgur.com")) {
        let imgurId = avatarVal.split('/').pop().split('?')[0]; 
        avatarVal = `https://i.imgur.com/${imgurId}.png`;
    }
    
    document.getElementById('profile-avatar-url').value = avatarVal;

    btnSaveProfile.innerText = "Saving...";
    btnSaveProfile.disabled = true;
    document.getElementById('profile-avatar-preview').src = (avatarVal !== "") ? avatarVal : "https://ui-avatars.com/api/?name=User&background=random";

    try {
        const { error } = await supabaseClient.from('profiles').upsert({
            id: currentUser.id, 
            username: usernameVal, 
            avatar_url: avatarVal, 
            travel_style: styleVal
        });

        if (error) throw error; 

        btnSaveProfile.innerText = "Saved!";
        btnSaveProfile.style.background = "#2196F3"; 
        
    } catch (error) {
        console.error("Error saving profile:", error);
        btnSaveProfile.innerText = "Error!";
        btnSaveProfile.style.background = "var(--danger-color)";
    } finally {
        setTimeout(() => { 
            btnSaveProfile.innerText = "Save Profile"; 
            btnSaveProfile.style.background = "var(--success-color)"; 
            btnSaveProfile.disabled = false;
        }, 2000);
    }
});

document.getElementById('profile-avatar-url').addEventListener('input', (e) => {
    let url = e.target.value.trim();
    url = url.replace(/\[img\]/gi, '').replace(/\[\/img\]/gi, '').trim();
    
    if (url.includes("imgur.com") && !url.includes("i.imgur.com")) {
        let imgurId = url.split('/').pop().split('?')[0]; 
        url = `https://i.imgur.com/${imgurId}.png`;
        e.target.value = url; 
    }
    document.getElementById('profile-avatar-preview').src = (url !== "") ? url : "https://ui-avatars.com/api/?name=User&background=random";
});

// ==========================================
// ENGINE 00.75: SOCIAL & FRIENDS WIDGET
// ==========================================

async function renderSocialDashboard() {
    if (!currentUser) return;
    
    let requestsContainer = document.getElementById('friend-requests-container');
    let friendsContainer = document.getElementById('friends-list-container');
    
    // 1. Fetch Pending Requests
    const { data: requests } = await supabaseClient
        .from('friendships')
        .select('*')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');

    requestsContainer.innerHTML = "";
    if (requests && requests.length > 0) {
        for (let req of requests) {
            let { data: sender } = await supabaseClient.from('profiles').select('*').eq('id', req.requester_id).single();
            if (sender) {
                requestsContainer.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${sender.avatar_url || 'https://ui-avatars.com/api/?name=U'}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
                            <span style="font-weight: bold; color: var(--text-color); font-size: 14px;">${sender.username}</span>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="respondToRequest('${req.id}', 'accepted')" style="background: var(--success-color); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Accept</button>
                            <button onclick="respondToRequest('${req.id}', 'rejected')" style="background: var(--danger-color); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Decline</button>
                        </div>
                    </div>
                `;
            }
        }
    } else {
        requestsContainer.innerHTML = `<p style="font-size: 13px; color: gray; text-align: center; margin: 5px 0;">No pending requests.</p>`;
    }

    // 2. Fetch Accepted Friends & Their Stats
    const { data: friendships } = await supabaseClient
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    friendsContainer.innerHTML = "";
    if (friendships && friendships.length > 0) {
        let friendsData = [];

        for (let rel of friendships) {
            let friendId = (rel.requester_id === currentUser.id) ? rel.receiver_id : rel.requester_id;
            let { data: friend } = await supabaseClient.from('profiles').select('*').eq('id', friendId).single();
            
            if (friend) {
                let { count } = await supabaseClient
                    .from('trips')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', friend.id);

                friendsData.push({
                    ...friend,
                    tripCount: count || 0,
                    relationshipId: rel.id
                });
            }
        }

        friendsData.sort((a, b) => b.tripCount - a.tripCount);

        // Render to UI
        for (let f of friendsData) {
            friendsContainer.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 10px 15px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${f.avatar_url || 'https://ui-avatars.com/api/?name=U'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">
                        <div>
                            <p style="margin: 0; font-weight: bold; color: var(--text-color); font-size: 15px;">${f.username || 'Unknown User'}</p>
                            <p style="margin: 0; font-size: 12px; color: gray; font-style: italic;">${f.travel_style || 'No style set'}</p>
                        </div>
                    </div>
                    
                    <div style="text-align: right;">
                        <div style="background: rgba(33, 150, 243, 0.15); color: var(--accent-color); padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; border: 1px solid rgba(33, 150, 243, 0.3);">
                            ✈️ ${f.tripCount} Trips
                        </div>
                        <button onclick="respondToRequest('${f.relationshipId}', 'rejected')" style="margin-top: 6px; background: transparent; border: none; color: var(--danger-color); font-size: 11px; cursor: pointer; text-decoration: underline;">Remove</button>
                    </div>
                </div>
            `;
        }
    } else {
        friendsContainer.innerHTML = `<p style="font-size: 13px; color: gray; text-align: center; margin: 5px 0;">No friends added yet. Try searching for someone!</p>`;
    }
}

// User Search Logic
document.getElementById('btn-search-friend').addEventListener('click', async () => {
    let query = document.getElementById('friend-search-input').value.trim();
    let resultsContainer = document.getElementById('friend-search-results');
    
    if (query === "") return;
    resultsContainer.innerHTML = `<p style="font-size: 12px; color: gray;">Searching...</p>`;

    const { data: users, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .ilike('username', `%${query}%`) 
        .neq('id', currentUser.id)
        .limit(5);

    resultsContainer.innerHTML = "";
    if (users && users.length > 0) {
        users.forEach(u => {
            resultsContainer.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${u.avatar_url || 'https://ui-avatars.com/api/?name=U'}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
                        <span style="font-weight: bold; color: var(--text-color); font-size: 14px;">${u.username || 'Unknown'}</span>
                    </div>
                    <button onclick="sendFriendRequest('${u.id}')" style="background: var(--accent-color); color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">+ Add</button>
                </div>
            `;
        });
    } else {
        resultsContainer.innerHTML = `<p style="font-size: 12px; color: var(--danger-color);">No users found.</p>`;
    }
});

// Action Handlers
window.sendFriendRequest = async function(receiverId) {
    const { error } = await supabaseClient.from('friendships').insert({
        requester_id: currentUser.id,
        receiver_id: receiverId
    });
    
    if (error) {
        alert("Request already sent or error occurred.");
    } else {
        alert("Friend request sent!");
        document.getElementById('friend-search-input').value = "";
        document.getElementById('friend-search-results').innerHTML = "";
    }
}

window.respondToRequest = async function(requestId, newStatus) {
    let err;

    if (newStatus === 'rejected') {
        const { error } = await supabaseClient.from('friendships').delete().eq('id', requestId);
        err = error;
    } else {
        const { error } = await supabaseClient.from('friendships').update({ status: newStatus }).eq('id', requestId);
        err = error;
    }

    // If Supabase blocks the action tell user
    if (err) {
        console.error("Friendship update failed:", err.message);
        alert("Failed to update friend status! Check the F12 console.");
    }

    renderSocialDashboard();
}

// ==========================================
// ENGINE 00.8: MULTIPLAYER & COLLABORATION
// ==========================================
let collabModal = document.getElementById('collab-modal');
let btnManageCollabs = document.getElementById('btn-manage-collabs');
let btnCloseCollab = document.getElementById('btn-close-collab');
let btnAddCollab = document.getElementById('btn-add-collab');

// 1. Open Modal
btnManageCollabs.addEventListener('click', async () => {
    if (!activeTripId || !currentUser) {
        alert("You must be logged in to manage collaborators.");
        return;
    }
    collabModal.style.display = 'block';
    await loadCollaborators();
    await loadFriendsDropdown();
});

btnCloseCollab.addEventListener('click', () => { collabModal.style.display = 'none'; });

// 2. Load Current Users attached to trip
async function loadCollaborators() {
    let list = document.getElementById('current-collabs-list');
    list.innerHTML = "<p style='font-size: 12px; color: gray;'>Loading team...</p>";

    const { data: collabs, error } = await supabaseClient
        .from('trip_collaborators')
        .select('user_id, role')
        .eq('trip_id', activeTripId);

    if (error || !collabs || collabs.length === 0) {
        list.innerHTML = "<p style='font-size: 12px; color: gray;'>Just you right now.</p>";
        return;
    }

    list.innerHTML = "";
    for (let c of collabs) {
        let { data: profile } = await supabaseClient.from('profiles').select('username, avatar_url').eq('id', c.user_id).single();
        if (profile) {
            list.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${profile.avatar_url || 'https://ui-avatars.com/api/?name=U'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                        <span style="font-size: 13px; font-weight: bold; color: var(--text-color);">${profile.username}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 10px; padding: 3px 6px; border-radius: 10px; background: var(--accent-color); color: white; text-transform: uppercase;">${c.role}</span>
                        <button onclick="removeCollaborator('${c.user_id}')" style="background: transparent; color: var(--danger-color); border: none; cursor: pointer; font-size: 16px; font-weight: bold; padding: 0 4px;" title="Remove user">×</button>
                    </div>
                </div>
            `;
        }
    }
}

// to remove a user from team
window.removeCollaborator = async function(userId) {
    if (!confirm("Are you sure you want to remove this person from the trip?")) return;
    
    const { error } = await supabaseClient
        .from('trip_collaborators')
        .delete()
        .match({ trip_id: activeTripId, user_id: userId });
        
    if (error) {
        console.error("Error removing:", error);
        alert("Failed to remove collaborator. Are you the original trip owner?");
    } else {
        await loadCollaborators();
    }
}

// 3. Load accepted friends into dropdown
async function loadFriendsDropdown() {
    let select = document.getElementById('collab-friend-select');
    select.innerHTML = '<option value="">Select a friend...</option>';

    const { data: friendships } = await supabaseClient
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    if (friendships) {
        for (let f of friendships) {
            let friendId = (f.requester_id === currentUser.id) ? f.receiver_id : f.requester_id;
            let { data: friendProfile } = await supabaseClient.from('profiles').select('id, username').eq('id', friendId).single();
            if (friendProfile) {
                select.innerHTML += `<option value="${friendProfile.id}">${friendProfile.username}</option>`;
            }
        }
    }
}

// 4. Attach Friend to Trip
btnAddCollab.addEventListener('click', async () => {
    let friendId = document.getElementById('collab-friend-select').value;
    if (!friendId) return alert("Select a friend from the list first.");

    let originalText = btnAddCollab.innerText;
    btnAddCollab.innerText = "...";
    btnAddCollab.disabled = true;

    const { error } = await supabaseClient.from('trip_collaborators').insert({
        trip_id: activeTripId,
        user_id: friendId,
        role: 'editor' 
    });

    btnAddCollab.disabled = false;
    btnAddCollab.innerText = originalText;

    if (error) {
        if (error.code === '23505') { 
            alert("This friend is already added to this trip!");
        } else {
            console.error("Collab error:", error);
            alert("Database error adding friend.");
        }
    } else {
        await loadCollaborators(); 
    }
});


// ==========================================
// ENGINE 0: MASTER DATABASE & ROUTER
// ==========================================
let activeTripId = null; 
let savedMaster = localStorage.getItem('myMasterTrips');
let masterTripsArray;

if (savedMaster) {
    masterTripsArray = JSON.parse(savedMaster);
    for (let i = 0; i < masterTripsArray.length; i++) {
        if (!masterTripsArray[i].days) {
            masterTripsArray[i].days = 1;
            masterTripsArray[i].locations.forEach(loc => { if (!loc.day) loc.day = 1; });
        }
        if (!masterTripsArray[i].destination) {
            if (masterTripsArray[i].id === "trip_japan") masterTripsArray[i].destination = "japan";
            else if (masterTripsArray[i].id === "trip_france") masterTripsArray[i].destination = "france";
            else masterTripsArray[i].destination = ""; 
        }
    }
} else {
    masterTripsArray = [];
}

btnLoadTrips.addEventListener('click', function() {
    pageWelcome.style.display = 'none';
    pageDashboard.style.display = 'block';
    resetWelcomeStage(); 
    renderDashboard();
});

btnBack.addEventListener('click', function() {
    pagePlanner.style.display = 'none'; 
    pageDashboard.style.display = 'block'; 
    activeTripId = null;
    resetChatWidget();
    renderDashboard();
});

btnHome.addEventListener('click', function() {
    pageDashboard.style.display = 'none';
    pageWelcome.style.display = 'flex'; 
    resetChatWidget();
    resetWelcomeStage();
});

function resetChatWidget() {
    let chatWindow = document.getElementById('ai-chat-window');
    let toggleBtn = document.getElementById('ai-toggle-btn');
    if (chatWindow) chatWindow.style.display = 'none';
    if (toggleBtn) toggleBtn.style.display = 'block';
}

function resetWelcomeStage() {
    let stage = document.getElementById('welcome-stage');
    let modal = document.getElementById('new-trip-modal');
    stage.classList.remove('modal-active');
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 600);
}

btnNewTrip.addEventListener('click', function() {
    let stage = document.getElementById('welcome-stage');
    let modal = document.getElementById('new-trip-modal');
    modal.style.display = 'block';
    setTimeout(() => { stage.classList.add('modal-active'); modal.classList.add('show'); }, 10);
});

modalCancel.addEventListener('click', function() { resetWelcomeStage(); });

modalCreate.addEventListener('click', function() {
    let rawName = document.getElementById('modal-trip-name').value;
    let rawDest = document.getElementById('modal-trip-dest').value; 
    let rawDates = document.getElementById('modal-trip-dates').value;
    let rawCats = document.getElementById('modal-trip-cats').value;

    if (rawName.trim() === "") { alert("yo you need to name the trip first!"); return; }
    if (rawDest.trim() === "") { alert("you gotta tell us what country you are going to!"); return; }

    let processedCategories = [];
    if (rawCats.trim() !== "") {
        let splitArray = rawCats.split(',');
        for (let i = 0; i < splitArray.length; i++) {
            let cleanCatName = splitArray[i].trim();
            if (cleanCatName !== "") processedCategories.push({ name: cleanCatName, checked: false });
        }
    }

    // -- AUTO CALCULATE DAYS --
    let calculatedDays = 1;
    if (rawDates.includes(" to ")) {
        let parts = rawDates.split(" to ");
        let d1 = new Date(parts[0]);
        let d2 = new Date(parts[1]);
        let diffTime = Math.abs(d2 - d1);
        calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    let newFolder = { 
        id: crypto.randomUUID(), 
        owner_id: currentUser ? currentUser.id : null,
        name: rawName, 
        destination: rawDest.toLowerCase().trim(), 
        dates: rawDates, 
        days: calculatedDays, 
        categories: processedCategories, 
        locations: [] 
    };

    masterTripsArray.push(newFolder);
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    syncTripToCloud(newFolder);

    document.getElementById('modal-trip-name').value = ""; document.getElementById('modal-trip-dest').value = ""; document.getElementById('modal-trip-dates').value = ""; document.getElementById('modal-trip-cats').value = "";
    newTripModal.style.display = 'none';
    pageWelcome.style.display = 'none';
    openTrip(newFolder.id); 
});

function renderDashboard() {
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    let dashHTML = "";
    for (let i = 0; i < masterTripsArray.length; i++) {
        let trip = masterTripsArray[i];
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

window.openTrip = function(tripId) {
    activeTripId = tripId; 
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    currentTripTitle.innerText = currentTrip.name + " itinerary";
    pageDashboard.style.display = 'none';
    pagePlanner.style.display = 'block';

    activeFilterDay = 0; 
    renderDayFilter(); renderCategories(); renderLocations(); fetchCurrencyRate(); loadWeather(); initMap();
}

// ==========================================
// ENGINE 0.5: DAY SCHEDULING & FILTERING
// ==========================================
let activeFilterDay = 0; 

function renderDayFilter() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    const dayNav = document.getElementById('day-navigation');
    
    let navHTML = "";
    let allActive = (activeFilterDay === 0) ? "day-btn-active" : "";
    navHTML += `<button onclick="setDayFilter(0)" class="day-btn ${allActive}">All</button>`;

    for (let i = 1; i <= currentTrip.days; i++) {
        let isActive = (activeFilterDay === i) ? "day-btn-active" : "";
        let shortDate = getShortDate(currentTrip.dates, i); // Gets "Jun 18"
        navHTML += `<button onclick="setDayFilter(${i})" class="day-btn ${isActive}">${shortDate}</button>`;
    }

    navHTML += `<button onclick="addDayToTrip()" class="day-btn day-btn-add">+</button>`;
    dayNav.innerHTML = navHTML;
}

window.setDayFilter = function(dayNumber) {
    activeFilterDay = dayNumber;
    renderDayFilter(); renderLocations(); renderMapPins(); 
}

window.addDayToTrip = function() {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    currentTrip.days++;
    renderDayFilter();
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));

    syncTripToCloud(currentTrip);
}

// ==========================================
// ENGINE 1: DYNAMIC CATEGORIES TRACKER
// ==========================================
let catContainer = document.getElementById('categories-container');
let addCatBtn = document.getElementById('add-cat-btn');

function renderCategories() {
    if (!activeTripId) return; 
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    let allCatHTML = "";
    let datalistHTML = "";

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
        
        datalistHTML += `<option value="${cat.name}">`; 
    }
    catContainer.innerHTML = allCatHTML;
    
    let datalist = document.getElementById('category-options');
    if (datalist) datalist.innerHTML = datalistHTML;

    for (let i = 0; i < currentTrip.categories.length; i++) {
        document.getElementById(`cat-check-${i}`).addEventListener('change', function(e) {
            currentTrip.categories[i].checked = e.target.checked;
            renderCategories();
            syncTripToCloud(currentTrip);
        });
        document.getElementById(`cat-del-${i}`).addEventListener('click', function() {
            currentTrip.categories.splice(i, 1);
            renderCategories();
            syncTripToCloud(currentTrip);
        });
    }
}

addCatBtn.addEventListener('click', function() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let newCatName = document.getElementById('new-cat-input').value;
    if (newCatName.trim() === "") { alert("please enter a category!"); return; }
    
    currentTrip.categories.push({ name: newCatName, checked: false });
    renderCategories();
    document.getElementById('new-cat-input').value = "";
    
    syncTripToCloud(currentTrip);
});

// ==========================================
// ENGINE 2: LOCATION CARDS
// ==========================================
let container = document.getElementById('locations-container');
let addButton = document.getElementById('add-btn');
let editingIndex = null; 

function renderLocations() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    localStorage.setItem('myMasterTrips', JSON.stringify(masterTripsArray));
    let allHTML = "";
    let tripTotal = 0; 

    currentTrip.locations.sort((a, b) => {
        let dayA = a.day || a.start_day || 1;
        let dayB = b.day || b.start_day || 1;
        if (dayA !== dayB) return dayA - dayB;
        return (a.order_index || 0) - (b.order_index || 0);
    });

    let currentRenderedDay = -1;
    let isFirstDay = true;

    for (let i = 0; i < currentTrip.locations.length; i++) {
        let spot = currentTrip.locations[i];
        
        // MULTI-DAY PERSISTENCE
        let isVisible = false;
        if (activeFilterDay === 0) { isVisible = true; } 
        else {
            if (spot.type === 'lodging') {
                if (activeFilterDay >= spot.start_day && activeFilterDay <= spot.end_day) isVisible = true;
            } else { if (spot.day === activeFilterDay) isVisible = true; }
        }
        if (!isVisible) continue;

        // DAY CONTAINERS
        let actualSpotDay = spot.day || spot.start_day || 1;
        let renderingForDay = (activeFilterDay === 0) ? actualSpotDay : activeFilterDay;

        if (renderingForDay !== currentRenderedDay) {
            if (!isFirstDay) allHTML += `</div>`; 
            isFirstDay = false;
            currentRenderedDay = renderingForDay;
            let fullDateString = formatDate(currentTrip.dates, renderingForDay);
            
            allHTML += `
                <div style="margin: 30px 0 15px 0; border-bottom: 2px solid var(--border-color); padding-bottom: 5px; display: flex; justify-content: space-between; align-items: baseline;">
                    <h2 style="margin: 0; font-size: 1.3em;">${fullDateString}</h2>
                    <span style="color: gray; font-size: 12px; font-weight: bold; text-transform: uppercase;">Day ${renderingForDay}</span>
                </div>
                <div class="sortable-day-list" data-day="${renderingForDay}" style="min-height: 50px; padding-bottom: 10px;">
            `;
        }

        let cardColor = spot.visited ? "background-color: rgba(76, 175, 80, 0.15);" : ""; 
        let buttonText = spot.visited ? "visited!" : "mark as visited";
        tripTotal += spot.cost || 0;

        // FLIGHT WIDGET
        if (spot.type === 'flight') {
            let iconColor = spot.direction === 'arrival' ? '#4CAF50' : '#ff9800';
            let flightTitle = spot.direction === 'arrival' ? 'Arrival Flight' : 'Departure Flight';
            
            allHTML += `
                <div class="sortable-item" data-index="${i}" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 12px; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s;">
                    <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${iconColor}; border-radius: 12px 0 0 12px;"></div>

                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-left: 8px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; color: ${iconColor}; letter-spacing: 0.5px; text-transform: uppercase;">${flightTitle}</span>
                                <span style="font-family: 'Space Grotesk', monospace; font-size: 18px; font-weight: bold; color: var(--text-color);">${spot.flight_number}</span>
                            </div>

                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                                <div style="font-size: 16px; color: gray;">${spot.direction === 'arrival' ? '🛬' : '🛫'}</div>
                                <div>
                                    <div id="route-flow-${i}" style="margin: 0; font-size: 14px; font-weight: bold; color: var(--text-color); letter-spacing: 0.5px;">Searching Route...</div>
                                    <p style="margin: 2px 0 0 0; font-size: 12px; color: gray;">${spot.name}</p>
                                </div>
                            </div>

                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 8px; display: flex; align-items: baseline; gap: 8px;">
                                    <span style="font-size: 10px; color: gray; letter-spacing: 0.5px;">GATE</span><span id="gate-${i}" style="font-size: 13px; font-weight: bold; color: white;">--</span>
                                </div>
                                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 8px; display: flex; align-items: baseline; gap: 8px;">
                                    <span style="font-size: 10px; color: gray; letter-spacing: 0.5px;">TERM</span><span id="term-${i}" style="font-size: 13px; font-weight: bold; color: white;">--</span>
                                </div>
                                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 8px; display: flex; align-items: baseline; gap: 8px;">
                                    <span style="font-size: 10px; color: gray; letter-spacing: 0.5px;">STATUS</span><span id="status-${i}" style="font-size: 12px; font-weight: bold; color: #ff9800;">LOADING</span>
                                </div>
                            </div>
                        </div>

                        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; height: 100%;">
                            <button id="delete-btn-${i}" style="background: transparent; color: gray; border: none; cursor: pointer; padding: 4px; transition: color 0.2s;" onmouseover="this.style.color='var(--danger-color)'" onmouseout="this.style.color='gray'">
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path></svg>
                            </button>
                            <span style="font-weight: bold; color: var(--success-color); font-size: 14px; background: rgba(76, 175, 80, 0.1); padding: 4px 8px; border-radius: 6px; margin-top: 40px;">$${(spot.cost || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
            
            setTimeout(() => {
                let dBtn = document.getElementById(`delete-btn-${i}`);
                if(dBtn) dBtn.addEventListener('click', function(){ currentTrip.locations.splice(i,1); renderLocations(); renderMapPins(); syncTripToCloud(currentTrip); });
                fetchFlightStatus(spot.flight_number, spot.direction, i);
            }, 50);

            continue; 
        }
        
        // LODGING & ACTIVITIES
        let isLodging = spot.type === 'lodging';
        if (isLodging) cardColor += " border-left: 4px solid var(--warning-color);";

        let headerLabel = isLodging 
            ? `<span style="color: var(--warning-color); margin-right: 8px;">🏨 Home:</span>`
            : `<span class="drag-handle" style="color: gray; font-size: 18px; margin-right: 12px; cursor: grab; padding: 0 5px;" title="Drag to reorder">⋮⋮</span>`; 
        
        let imageBlock = "";
        let imgs = spot.imageUrl;
        if (typeof imgs === 'string' && imgs !== "") imgs = [imgs];
        if (!imgs) imgs = [];

        if (imgs.length > 0) {
            let imgHTML = "";
            imgs.forEach(url => { imgHTML += `<img src="${url}" onclick="openLightbox('${url}')" style="height: 120px; width: 160px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-color); transition: filter 0.2s; flex-shrink: 0;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='brightness(1)'">`; });
            imageBlock = `<div style="display: flex; overflow-x: auto; gap: 10px; margin: 10px 0; padding-bottom: 8px;">${imgHTML}</div>`;
        } else {
            imageBlock = `<div style="width: 100%; height: 60px; background: rgba(0,0,0,0.1); border-radius: 6px; margin: 10px 0; display: flex; align-items: center; justify-content: center; color: gray; font-size: 12px; border: 1px dashed var(--border-color);">no images available</div>`;
        }

        allHTML += `
            <div class="locations sortable-item" id="card-${i}" data-index="${i}" style="${cardColor} padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
                    <h3 style="margin: 0; font-size: 1.1em; color: var(--text-color); display: flex; align-items: center;">
                        ${headerLabel}${spot.name}
                    </h3>
                    <span style="font-weight: bold; color: var(--success-color);">$${(spot.cost || 0).toFixed(2)}</span>
                </div>
                <p style="margin: 2px 0; font-size: 13px; color: var(--text-color); opacity: 0.8;"><strong>cat:</strong> ${spot.category}</p>
                ${imageBlock}
                <p style="margin: 2px 0 10px 0; font-size: 13px; color: var(--text-color);"><strong>notes:</strong> ${spot.notes}</p>
                
                <div style="display: flex; gap: 8px;">
                    <button id="btn-${i}" style="font-size: 12px; padding: 4px 8px;">${buttonText}</button>
                    <button id="edit-btn-${i}" style="font-size: 12px; padding: 4px 8px; background-color: var(--warning-color); border: none; border-radius: 3px; cursor: pointer; color: black;">edit</button>
                    <button id="delete-btn-${i}" style="font-size: 12px; padding: 4px 8px; background-color: var(--danger-color); color: white; border: none; border-radius: 3px; cursor: pointer;">delete</button>
                </div>
            </div>
        `;
    }

    if (!isFirstDay) allHTML += `</div>`;

    container.innerHTML = allHTML;

    setTimeout(() => {
        document.querySelectorAll('.sortable-day-list').forEach(listEl => {
            new Sortable(listEl, {
                group: 'itinerary',
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    syncArrayWithDOM();
                }
            });
        });
    }, 100);


    let budgetDisplay = document.getElementById('budget-display');
    if (budgetDisplay) budgetDisplay.innerText = `total spending: $${tripTotal.toFixed(2)}`;

    for (let i = 0; i < currentTrip.locations.length; i++) {
        let visBtn = document.getElementById(`btn-${i}`);
        if(visBtn) {
            visBtn.addEventListener('click', function() {
                currentTrip.locations[i].visited = !currentTrip.locations[i].visited;
                renderLocations();

                syncTripToCloud(currentTrip);
            });

            document.getElementById(`delete-btn-${i}`).addEventListener('click', function(){
                currentTrip.locations.splice(i,1);
                renderLocations(); renderMapPins(); loadWeather(); syncTripToCloud(currentTrip);
            });

            document.getElementById(`edit-btn-${i}`).addEventListener('click', function(){
                document.getElementById('new-name').value = currentTrip.locations[i].name;
                document.getElementById('new-day').value = currentTrip.locations[i].day || 1; 
                document.getElementById('new-category').value = currentTrip.locations[i].category;
                document.getElementById('new-notes').value = currentTrip.locations[i].notes;
                document.getElementById('new-price').value = currentTrip.locations[i].cost || "";
                
                editingIndex = i;
                addButton.innerText = "update location"; addButton.style.backgroundColor = "#ffc107"; addButton.style.color = "black";
                document.getElementById('new-name').focus();
            });
        }
    }

    window.syncArrayWithDOM = function() {
        let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
        let hasChanges = false;

        document.querySelectorAll('.sortable-day-list').forEach(dayList => {
            let dayNum = parseInt(dayList.getAttribute('data-day'));
            
            let cards = dayList.querySelectorAll('.sortable-item');
            cards.forEach((card, index) => {
                let originalIndex = parseInt(card.getAttribute('data-index'));
                let spot = currentTrip.locations[originalIndex];
                
                if (spot.type !== 'flight' && spot.type !== 'lodging') {
                    if (spot.day !== dayNum) {
                        spot.day = dayNum;
                        hasChanges = true;
                    }
                }
                if (spot.type !== 'flight') {
                    if (spot.order_index !== index) {
                        spot.order_index = index;
                        hasChanges = true;
                    }
                }
            });
        });

        if (hasChanges) {
            renderLocations();
            renderMapPins();
            syncTripToCloud(currentTrip);
        }
    };
}

async function smartGeocode(rawName, country) {
    let cleanName = rawName.replace(/ *\([^)]*\) */g, "").trim();
    let firstWord = cleanName.split(" ")[0];
    let searchAttempts = [ `${rawName}, ${country}`, `${cleanName}, ${country}`, rawName, cleanName ];
    if (firstWord && firstWord.length > 3) searchAttempts.push(`${firstWord}, ${country}`); 

    for (let i = 0; i < searchAttempts.length; i++) {
        let query = searchAttempts[i];
        try {
            let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            let data = await res.json();
            if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } catch (error) { console.error(`Geocode error on "${query}":`, error); }
        await new Promise(resolve => setTimeout(resolve, 800));
    }
    return { lat: 0, lng: 0 };
}

// Unsplash Photo Fetcher
async function fetchLocationImages(query) {
    let cleanName = query.replace(/ *\([^)]*\) */g, "").trim(); 
    try {
        let res = await fetch(`/.netlify/functions/images?q=${encodeURIComponent(cleanName)}`);
        
        if (!res.ok) return [];
        
        let urls = await res.json();
        return urls; 
        
    } catch (error) { 
        console.error("Image fetch error:", error); 
        return []; 
    }
}

// Lightbox Controls
window.openLightbox = function(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-modal').style.display = 'flex';
}
document.getElementById('lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox-modal').style.display = 'none';
    document.getElementById('lightbox-img').src = "";
});

// ==============================
// NEW TRIP: SMART COMPLETE
// ==============================
let destGeocodeTimer;
const destInput = document.getElementById('modal-trip-dest');
const destDropdown = document.getElementById('dest-autocomplete-results');

function positionDestDropdown() {
    const rect = destInput.getBoundingClientRect();
    destDropdown.style.width = rect.width + 'px';
    destDropdown.style.top = (destInput.offsetTop + destInput.offsetHeight) + 'px';
    destDropdown.style.left = destInput.offsetLeft + 'px';
}

destInput.addEventListener('input', (e) => {
    clearTimeout(destGeocodeTimer);
    let query = e.target.value.trim();

    if (query.length < 3) {
        destDropdown.style.display = 'none';
        return;
    }

    destGeocodeTimer = setTimeout(async () => {
        try {
            let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&types=place,region,country&limit=5`;

            let res = await fetch(url);
            let data = await res.json();

            destDropdown.innerHTML = "";
            
            if (data.features && data.features.length > 0) {
                positionDestDropdown();
                
                data.features.forEach(place => {
                    let div = document.createElement('div');
                    div.style.cssText = "padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-color); transition: background 0.2s;";
                    
                    div.innerHTML = `<strong>${place.text}</strong> <br><span style="color: gray; font-size: 11px;">${place.place_name}</span>`;
                    
                    div.onmouseover = () => div.style.background = "rgba(33, 150, 243, 0.15)";
                    div.onmouseout = () => div.style.background = "transparent";
                    
                    div.onclick = () => {
                        destInput.value = place.place_name;
                        destDropdown.style.display = 'none';
                    };
                    
                    destDropdown.appendChild(div);
                });
                destDropdown.style.display = 'block';
            } else {
                destDropdown.style.display = 'none';
            }
        } catch (err) {
            console.error("Dest Autocomplete failed:", err);
        }
    }, 300);
});

document.addEventListener('click', (e) => {
    if (!destInput.contains(e.target) && !destDropdown.contains(e.target)) {
        destDropdown.style.display = 'none';
    }
});



// ==================
// SMART AUTOCOMPLETE
// ==================
let geocodeTimer;
let lockedLocationData = null; 

const locationInputField = document.getElementById('new-name');
const autocompleteDropdown = document.getElementById('autocomplete-results');

function positionAutocompleteDropdown() {
    const rect = locationInputField.getBoundingClientRect();
    autocompleteDropdown.style.width = rect.width + 'px';
    autocompleteDropdown.style.top = (locationInputField.offsetTop + locationInputField.offsetHeight) + 'px';
    autocompleteDropdown.style.left = locationInputField.offsetLeft + 'px';
}

locationInputField.addEventListener('input', (e) => {
    clearTimeout(geocodeTimer);
    let query = e.target.value.trim();
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    lockedLocationData = null; 

    if (query.length < 3) {
        autocompleteDropdown.style.display = 'none';
        return;
    }

    geocodeTimer = setTimeout(async () => {
        try {
            let contextQuery = encodeURIComponent(`${query} ${currentTrip.destination}`);
            let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${contextQuery}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&types=poi,place,address&limit=5`;

            let res = await fetch(url);
            let data = await res.json();

            autocompleteDropdown.innerHTML = "";
            
            if (data.features && data.features.length > 0) {
                positionAutocompleteDropdown();
                
                data.features.forEach(place => {
                    let div = document.createElement('div');
                    div.style.cssText = "padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-color); transition: background 0.2s;";
                    
                    div.innerHTML = `<strong>${place.text}</strong> <br><span style="color: gray; font-size: 11px;">${place.place_name.replace(place.text + ", ", "")}</span>`;
                    
                    div.onmouseover = () => div.style.background = "rgba(33, 150, 243, 0.15)";
                    div.onmouseout = () => div.style.background = "transparent";
                    
                    div.onclick = () => {
                        locationInputField.value = place.text;
                        lockedLocationData = {
                            lat: place.geometry.coordinates[1],
                            lng: place.geometry.coordinates[0]
                        };
                        autocompleteDropdown.style.display = 'none';
                    };
                    
                    autocompleteDropdown.appendChild(div);
                });
                autocompleteDropdown.style.display = 'block';
            } else {
                autocompleteDropdown.style.display = 'none';
            }
        } catch (err) {
            console.error("Autocomplete failed:", err);
        }
    }, 300);
});

// Hide dropdown if user clicks outside
document.addEventListener('click', (e) => {
    if (!locationInputField.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
        autocompleteDropdown.style.display = 'none';
    }
});

addButton.addEventListener('click', async function() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    let nameInput = document.getElementById('new-name').value;
    let dayInput = document.getElementById('new-day').value; 
    let categoryInput = document.getElementById('new-category').value;
    let notesInput = document.getElementById('new-notes').value;
    let priceInput = document.getElementById('new-price').value; 

    if (nameInput.trim() === "") { alert("please enter a location name before saving!"); return; }
    if (categoryInput.trim() === "") { alert("please enter a category type before saving!"); return; }

    let cleanDayNum = parseInt(dayInput) || 1;
    if (cleanDayNum > currentTrip.days) currentTrip.days = cleanDayNum;
    
    let catExists = currentTrip.categories.some(c => c.name.toLowerCase().trim() === categoryInput.toLowerCase().trim());
    if (!catExists) {
        currentTrip.categories.push({ name: categoryInput.trim(), checked: false });
        renderCategories();
    }

    let originalBtnText = addButton.innerText;
    addButton.innerText = "fetching map & images..."; addButton.disabled = true;

    let coords = { lat: 0, lng: 0 };
    
    if (lockedLocationData) {
        coords.lat = lockedLocationData.lat;
        coords.lng = lockedLocationData.lng;
        console.log("📍 Using verified Mapbox dropdown coordinates.");
    } else {
        coords = await smartGeocode(nameInput, currentTrip.destination);
    }
    
    let imgUrls = await fetchLocationImages(nameInput);
    
    if (coords.lat === 0 && coords.lng === 0) alert(`Saved to list! Map couldn't find exact GPS coordinates for "${nameInput}".`);

    let existingImages = [];
    if (editingIndex !== null) {
        let oldImg = currentTrip.locations[editingIndex].imageUrl;
        if (Array.isArray(oldImg)) existingImages = oldImg;
        else if (typeof oldImg === 'string' && oldImg !== "") existingImages = [oldImg];
    }

    let newLocation = {
        name: nameInput, day: cleanDayNum, category: categoryInput, notes: notesInput,
        visited: (editingIndex !== null) ? currentTrip.locations[editingIndex].visited : false,
        cost: parseFloat(priceInput) || 0, lat: coords.lat, lng: coords.lng,
        imageUrl: (imgUrls && imgUrls.length > 0) ? imgUrls : existingImages 
    };

    if (editingIndex !== null) {
        currentTrip.locations[editingIndex] = newLocation;
        editingIndex = null; 
        addButton.style.backgroundColor = "var(--success-color)"; addButton.style.color = "white";
    } else {
        currentTrip.locations.push(newLocation);
    }

    lockedLocationData = null;

    addButton.innerText = "save location"; addButton.disabled = false;
    
    renderDayFilter(); renderLocations(); renderMapPins(); loadWeather(); syncTripToCloud(currentTrip);
    
    document.getElementById('new-name').value = ""; document.getElementById('new-day').value = "1"; document.getElementById('new-category').value = ""; document.getElementById('new-notes').value = ""; document.getElementById('new-price').value = ""; 
});

// ==========================================
// ENGINE 2.1: LODGING & HOUSING MODAL
// ==========================================
let lodgingModal = document.getElementById('lodging-modal');
let lodgingGeocodeTimer;
let lockedLodgingData = null;

document.getElementById('btn-open-lodging').addEventListener('click', () => {
    lodgingModal.style.display = 'block';
});

document.getElementById('btn-close-lodging').addEventListener('click', () => {
    lodgingModal.style.display = 'none';
    lockedLodgingData = null;
});

// Autocomplete for Lodging
const lodgingInput = document.getElementById('lodging-name');
const lodgingDropdown = document.getElementById('lodging-autocomplete-results');

lodgingInput.addEventListener('input', (e) => {
    clearTimeout(lodgingGeocodeTimer);
    let query = e.target.value.trim();
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    lockedLodgingData = null;

    if (query.length < 3) {
        lodgingDropdown.style.display = 'none';
        return;
    }

    lodgingGeocodeTimer = setTimeout(async () => {
        try {
            let contextQuery = encodeURIComponent(`${query} ${currentTrip.destination}`);
            let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${contextQuery}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&types=address,poi,place&limit=5`;

            let res = await fetch(url);
            let data = await res.json();

            lodgingDropdown.innerHTML = "";
            if (data.features && data.features.length > 0) {
                data.features.forEach(place => {
                    let div = document.createElement('div');
                    div.style.cssText = "padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-color); transition: background 0.2s;";
                    div.innerHTML = `<strong>${place.text}</strong> <br><span style="color: gray; font-size: 11px;">${place.place_name.replace(place.text + ", ", "")}</span>`;
                    
                    div.onmouseover = () => div.style.background = "rgba(33, 150, 243, 0.15)";
                    div.onmouseout = () => div.style.background = "transparent";
                    
                    div.onclick = () => {
                        lodgingInput.value = place.text;
                        lockedLodgingData = { lat: place.geometry.coordinates[1], lng: place.geometry.coordinates[0] };
                        lodgingDropdown.style.display = 'none';
                    };
                    lodgingDropdown.appendChild(div);
                });
                lodgingDropdown.style.display = 'block';
            }
        } catch (err) { console.error("Lodging autocomplete failed:", err); }
    }, 300);
});

document.addEventListener('click', (e) => {
    if (lodgingInput && lodgingDropdown) {
        if (!lodgingInput.contains(e.target) && !lodgingDropdown.contains(e.target)) {
            lodgingDropdown.style.display = 'none';
        }
    }
});

// Save Lodging
document.getElementById('btn-save-lodging').addEventListener('click', async () => {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let name = lodgingInput.value;
    let startDay = parseInt(document.getElementById('lodging-start').value);
    let endDay = parseInt(document.getElementById('lodging-end').value);
    let cost = parseFloat(document.getElementById('lodging-cost').value) || 0;

    if (!name) return alert("Enter a lodging name.");
    if (endDay < startDay) return alert("Check-out day cannot be before Check-in day.");

    document.getElementById('btn-save-lodging').innerText = "Saving...";

    let coords = lockedLodgingData || await smartGeocode(name, currentTrip.destination);
    let imgUrls = await fetchLocationImages(name);

    // Expand trip length if checkout day is > trip length
    if (endDay > currentTrip.days) currentTrip.days = endDay;

    let newLodging = {
        name: name,
        type: 'lodging',
        day: startDay,
        start_day: startDay,
        end_day: endDay,
        category: "Lodging",
        notes: `Check-in: Day ${startDay} | Check-out: Day ${endDay}`,
        cost: cost,
        lat: coords.lat,
        lng: coords.lng,
        imageUrl: imgUrls || []
    };

    currentTrip.locations.push(newLodging);
    
    // Reset Modal
    lodgingInput.value = "";
    document.getElementById('lodging-start').value = "1";
    document.getElementById('lodging-end').value = "2";
    document.getElementById('lodging-cost').value = "";
    document.getElementById('btn-save-lodging').innerText = "Save Lodging";
    lodgingModal.style.display = 'none';
    lockedLodgingData = null;

    renderDayFilter(); renderLocations(); renderMapPins(); syncTripToCloud(currentTrip);
});

// ==========================================
// ENGINE 2.2: FLIGHT TRACKER MODAL
// ==========================================
let flightModal = document.getElementById('flight-modal');
let flightGeocodeTimer;
let lockedFlightData = null;

document.getElementById('btn-open-flight').addEventListener('click', () => { flightModal.style.display = 'block'; });
document.getElementById('btn-close-flight').addEventListener('click', () => { flightModal.style.display = 'none'; lockedFlightData = null; });

const flightInput = document.getElementById('flight-airport');
const flightDropdown = document.getElementById('flight-autocomplete-results');

flightInput.addEventListener('input', (e) => {
    clearTimeout(flightGeocodeTimer);
    let query = e.target.value.trim();
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    lockedFlightData = null;

    if (query.length < 3) { flightDropdown.style.display = 'none'; return; }

    flightGeocodeTimer = setTimeout(async () => {
        try {
            // Biased toward airports
            let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&types=poi&limit=5`;
            let res = await fetch(url);
            let data = await res.json();

            flightDropdown.innerHTML = "";
            if (data.features && data.features.length > 0) {
                let airports = data.features.filter(f => f.place_name.toLowerCase().includes('airport') || f.place_name.toLowerCase().includes('intl'));
                let displayData = airports.length > 0 ? airports : data.features;

                displayData.forEach(place => {
                    let div = document.createElement('div');
                    div.style.cssText = "padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-color); transition: background 0.2s;";
                    div.innerHTML = `<strong>✈️ ${place.text}</strong> <br><span style="color: gray; font-size: 11px;">${place.place_name.replace(place.text + ", ", "")}</span>`;
                    div.onmouseover = () => div.style.background = "rgba(33, 150, 243, 0.15)";
                    div.onmouseout = () => div.style.background = "transparent";
                    div.onclick = () => {
                        flightInput.value = place.text;
                        lockedFlightData = { lat: place.geometry.coordinates[1], lng: place.geometry.coordinates[0] };
                        flightDropdown.style.display = 'none';
                    };
                    flightDropdown.appendChild(div);
                });
                flightDropdown.style.display = 'block';
            }
        } catch (err) { console.error("Flight autocomplete failed:", err); }
    }, 300);
});

document.addEventListener('click', (e) => {
    if (flightInput && flightDropdown && !flightInput.contains(e.target) && !flightDropdown.contains(e.target)) {
        flightDropdown.style.display = 'none';
    }
});

document.getElementById('btn-save-flight').addEventListener('click', async () => {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let direction = document.getElementById('flight-direction').value;
    let flightNum = document.getElementById('flight-number').value.toUpperCase();
    let airportName = flightInput.value;
    let cost = parseFloat(document.getElementById('flight-cost').value) || 0;

    if (!flightNum || !airportName) return alert("Enter a Flight Number and Airport.");

    document.getElementById('btn-save-flight').innerText = "Saving...";

    let coords = lockedFlightData || await smartGeocode(airportName, currentTrip.destination);

    // Lock day and index based on direction
    let targetDay = direction === 'arrival' ? 1 : currentTrip.days;
    let targetIndex = direction === 'arrival' ? -1 : 999; 

    let newFlight = {
        name: airportName,
        type: 'flight',
        flight_number: flightNum,
        direction: direction,
        day: targetDay,
        order_index: targetIndex, 
        category: "Transit",
        notes: `Flight Tracker Pending for ${flightNum}`,
        cost: cost,
        lat: coords.lat,
        lng: coords.lng,
        imageUrl: []
    };

    currentTrip.locations.push(newFlight);
    
    // Reset Modal
    flightInput.value = ""; document.getElementById('flight-number').value = ""; document.getElementById('flight-cost').value = "";
    document.getElementById('btn-save-flight').innerText = "Save Flight";
    flightModal.style.display = 'none'; lockedFlightData = null;

    renderDayFilter(); renderLocations(); renderMapPins(); syncTripToCloud(currentTrip);
});

// ==========================================
// ENGINE 3: DATA MANAGEMENT
// ==========================================
window.deleteTrip = function(tripId) {
    if (!confirm("yo are you sure you want to delete this entire trip?")) return;
    let tripToDelete = masterTripsArray.find(t => t.id === tripId);
    masterTripsArray = masterTripsArray.filter(t => t.id !== tripId);
    renderDashboard();
    if (tripToDelete) syncTripToCloud(tripToDelete, true);
}

document.getElementById('btn-export').addEventListener('click', function() {
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let saveCode = btoa(JSON.stringify(currentTrip));
    navigator.clipboard.writeText(saveCode).then(() => alert("success! trip code copied to clipboard.")).catch(() => prompt("copy it manually here:", saveCode));
});

document.getElementById('btn-import').addEventListener('click', function() {
    let pastedCode = prompt("paste the trip code here:");
    if (!pastedCode) return; 
    try {
        let importedTrip = JSON.parse(atob(pastedCode));
        
        importedTrip.id = crypto.randomUUID(); 
        
        masterTripsArray.push(importedTrip);
        renderDashboard();
        
        syncTripToCloud(importedTrip);
        
        alert("trip successfully imported!");
    } catch (error) { 
        alert("that code is invalid."); 
    }
});

// ==========================================
// ENGINE 4: EXTERNAL APIS
// ==========================================
async function fetchCurrencyRate() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    let rateTextElement = document.getElementById('currency-rate-text');
    if (!rateTextElement) return;

    try {
        rateTextElement.innerText = "locating..."; rateTextElement.style.color = "#888"; 
        
        let destParts = currentTrip.destination.split(',');
        let countryName = destParts[destParts.length - 1].trim().toLowerCase();
        
        const commonCurrencies = {
            "united states": "USD", "japan": "JPY", "united kingdom": "GBP",
            "france": "EUR", "germany": "EUR", "italy": "EUR", "spain": "EUR",
            "canada": "CAD", "australia": "AUD", "mexico": "MXN", "india": "INR",
            "china": "CNY", "south korea": "KRW", "switzerland": "CHF",
            "ireland": "EUR", "new zealand": "NZD", "singapore": "SGD",
            "united arab emirates": "AED", "netherlands": "EUR", "greece": "EUR"
        };

        let targetCurrency = commonCurrencies[countryName];

        if (!targetCurrency) {
            let countryResponse = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}`);
            if (!countryResponse.ok) { rateTextElement.innerText = "unknown country"; return; }
            targetCurrency = Object.keys((await countryResponse.json())[0].currencies)[0]; 
        }

        rateTextElement.innerText = "fetching rate...";

        let rateData = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
        let rate = rateData.rates[targetCurrency];

        if (rate) {
            rateTextElement.innerText = `1 USD = ${rate.toFixed(2)} ${targetCurrency}`;
            rateTextElement.style.color = "var(--success-color)"; rateTextElement.style.fontWeight = "bold"; rateTextElement.style.fontSize = "24px"; rateTextElement.style.marginTop = "15px"; rateTextElement.style.display = "block"; 
        } else { 
            rateTextElement.innerText = "rate not found"; 
        }
    } catch (error) { 
        console.error("Currency Engine Error:", error);
        rateTextElement.innerText = "api offline"; 
    }
}

async function loadWeather() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    const weatherText = document.getElementById('weather-text');
    if (!currentTrip || !currentTrip.destination) { weatherText.innerText = "no destination"; return; }

    weatherText.innerText = "scanning regions..."; 
    let finalWeatherHTML = ""; let locationsToFetch = []; 

    let destParts = currentTrip.destination.split(',');
    let cityName = destParts[0].trim();

    try {
        let minDistanceKm = 50;
        
        // Sort chronologically
        let sortedSpots = [...currentTrip.locations].sort((a,b) => a.day - b.day);

        for (let spot of sortedSpots) {
            if (spot.lat && spot.lng && spot.lat !== 0 && locationsToFetch.length < 3) {
                let isFarEnough = true;
                
                for (let savedLoc of locationsToFetch) {
                    let from = turf.point([savedLoc.lng, savedLoc.lat]);
                    let to = turf.point([spot.lng, spot.lat]);
                    let dist = turf.distance(from, to, { units: 'kilometers' });
                    
                    if (dist < minDistanceKm) {
                        isFarEnough = false;
                        break;
                    }
                }

                if (isFarEnough || locationsToFetch.length === 0) {
                    locationsToFetch.push({ 
                        name: spot.name.substring(0, 14) + (spot.name.length > 14 ? "..." : ""), 
                        lat: spot.lat, 
                        lng: spot.lng 
                    });
                }
            }
        }

        if (locationsToFetch.length === 0) {
             let fallbackData = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`)).json();
             if (fallbackData.results?.length > 0) {
                 locationsToFetch.push({ name: cityName, lat: fallbackData.results[0].latitude, lng: fallbackData.results[0].longitude });
             } else {
                 weatherText.innerText = "Location not found"; return;
             }
        }

        for (let loc of locationsToFetch) {
            let weatherData = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current_weather=true`)).json();
            const weatherCode = weatherData.current_weather.weathercode;
            const tempF = ((weatherData.current_weather.temperature * 9/5) + 32).toFixed(1);
            const weatherMap = { 0:"☀️", 1:"🌤️", 2:"⛅", 3:"☁️", 45:"🌫️", 48:"🌫️", 51:"🌧️", 53:"🌧️", 55:"🌧️", 61:"🌧️", 63:"🌧️", 65:"🌧️", 71:"🌨️", 73:"🌨️", 75:"🌨️", 95:"⛈️" };
            
            finalWeatherHTML += `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding: 6px 0;"><span style="font-weight: bold; text-transform: capitalize; font-size: 13px;">${loc.name}</span><span style="font-size: 13px;">${weatherMap[weatherCode] || "🌈"} ${tempF}°F</span></div>`;
        }
        weatherText.innerHTML = finalWeatherHTML || "weather unavailable";
    } catch (error) { weatherText.innerText = "api offline"; }
}

// ===============================
// AIRLABS FLIGHT TRACKING ENGINE
// ===============================
let flightDataCache = {}; 

async function fetchFlightStatus(flightIata, direction, widgetId) {
    let cleanInput = flightIata.replace(/\s+/g, '').toUpperCase();
    let cacheKey = `${cleanInput}-${direction}`;

    let gateEl = document.getElementById(`gate-${widgetId}`);
    let termEl = document.getElementById(`term-${widgetId}`);
    let statusEl = document.getElementById(`status-${widgetId}`);
    let routeEl = document.getElementById(`route-flow-${widgetId}`);

    if (!gateEl || !termEl || !statusEl) return;

    if (flightDataCache[cacheKey]) {
        applyFlightDataToUI(flightDataCache[cacheKey], direction, gateEl, termEl, statusEl, routeEl);
        return;
    }

    try {
        let isIcao = /^[A-Z]{3}/.test(cleanInput);
        let apiParam = isIcao ? 'flight_icao' : 'flight_iata';

        let res = await fetch(`/.netlify/functions/flight?${apiParam}=${cleanInput}`);
        let json = await res.json();

        if (json.error) {
            console.error(`AirLabs API Error for ${cleanInput}:`, json.error.message);
            statusEl.innerText = "API ERROR (Check F12)";
            statusEl.style.color = "var(--danger-color)";
            if (routeEl) routeEl.innerText = "Tracking Offline";
            return;
        }

        if (json.response && json.response.length > 0) {
            flightDataCache[cacheKey] = json.response[0]; 
            applyFlightDataToUI(json.response[0], direction, gateEl, termEl, statusEl, routeEl);
        } else {
            statusEl.innerText = "FUTURE FLIGHT";
            statusEl.style.color = "gray";
            if (routeEl) routeEl.innerText = "Pending Schedule...";
        }
    } catch (err) {
//...
        console.error("AirLabs Network Error:", err);
        statusEl.innerText = "NETWORK ERROR";
        statusEl.style.color = "var(--danger-color)";
        if (routeEl) routeEl.innerText = "Offline";
    }
}

// Helper to handle "Arrival vs Departure" logic 
function applyFlightDataToUI(flight, direction, gateEl, termEl, statusEl, routeEl) {
    let prefix = direction === 'arrival' ? 'arr' : 'dep';
    
    gateEl.innerText = flight[`${prefix}_gate`] || "--";
    termEl.innerText = flight[`${prefix}_terminal`] || "--";
    
    let status = flight.status || "SCHEDULED";
    statusEl.innerText = status.toUpperCase();
    
    if (status === "active") statusEl.style.color = "var(--success-color)";
    else if (status === "delayed" || status === "cancelled") statusEl.style.color = "var(--danger-color)";
    else statusEl.style.color = "#ff9800";

    if (routeEl) {
        try {
            let depCode = flight.dep_iata || flight.dep_icao || "ORG";
            let arrCode = flight.arr_iata || flight.arr_icao || "DST";
            
            let timeStr = String(flight[`${prefix}_time`] || flight[`${prefix}_estimated`] || "");
            let cleanTime = timeStr.includes(" ") ? timeStr.split(" ")[1] : timeStr;
            
            let timeHtml = cleanTime ? `<span style="margin-left: 10px; color: gray; font-weight: normal; font-family: monospace;">${cleanTime}</span>` : "";
            
            routeEl.innerHTML = `${depCode} ➔ ${arrCode} ${timeHtml}`;
        } catch (error) {
            console.error("Error parsing route data:", error);
            routeEl.innerText = "Route Locked";
        }
    }
}

// ==========================================
// ENGINE 5: UI LIBRARIES & THEMES
// ==========================================

flatpickr("#modal-trip-dates, #edit-trip-dates", { 
    mode: "range", 
    dateFormat: "M j, Y", 
    minDate: "today", 
    showMonths: 1 
});

let themeToggleBtn = document.getElementById('theme-toggle');
let flatpickrThemeLink = document.getElementById('flatpickr-theme');

function updateCalendarTheme(isDark) {
    if (flatpickrThemeLink) {
        flatpickrThemeLink.href = isDark 
            ? "https://npmcdn.com/flatpickr/dist/themes/dark.css" 
            : "https://npmcdn.com/flatpickr/dist/themes/airbnb.css";
    }
}

// Check local storage for theme
let isCurrentlyDark = localStorage.getItem('myAppTheme') === 'dark';
if (isCurrentlyDark) {
    document.body.classList.add('dark-mode');
    themeToggleBtn.innerText = "☀️ Light Mode"; 
    themeToggleBtn.style.color = "white";
}
updateCalendarTheme(isCurrentlyDark);

// Toggle Listener
themeToggleBtn.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    let isDark = document.body.classList.contains('dark-mode');

    if (isDark) {
        themeToggleBtn.innerText = "☀️ Light Mode"; 
        themeToggleBtn.style.color = "white"; 
        localStorage.setItem('myAppTheme', 'dark');
    } else {
        themeToggleBtn.innerText = "🌙 Dark Mode"; 
        themeToggleBtn.style.color = "black"; 
        localStorage.setItem('myAppTheme', 'light');
    }
    
    updateCalendarTheme(isDark);
    
    // Transition 3D lighting without reloading map
    if (myMap) {
        myMap.setConfigProperty('basemap', 'lightPreset', isDark ? 'dusk' : 'dawn');
    }
});

// ==========================================
// ENGINE 6: MAPBOX INTERACTIVE 3D MAP
// ==========================================
mapboxgl.accessToken = 'pk.eyJ1Ijoib3BhejIzMDMiLCJhIjoiY21wbGg5aXB4MjY1czJxcGxtNzNnd3l3dSJ9.RlM-MZ6FwK3ooJFeV8eElw'; 

let myMap = null; 
let mapMarkers = [];
let currentRouteMode = "driving"; 

document.querySelectorAll('.route-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.route-btn').forEach(b => b.classList.remove('route-btn-active'));
        this.classList.add('route-btn-active');
        
        let rawMode = this.getAttribute('data-mode');
        if (rawMode === 'car') currentRouteMode = 'driving';
        if (rawMode === 'foot') currentRouteMode = 'walking';
        if (rawMode === 'bike') currentRouteMode = 'cycling';
        
        renderMapPins(); 
    });
});

async function initMap() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    
    // Default fallback (center of world)
    let centerLng = -74.5, centerLat = 40, zoomLevel = 2; 

    if (currentTrip.locations && currentTrip.locations.length > 0) {
        let firstLoc = currentTrip.locations.find(l => l.lat && l.lng);
        if (firstLoc) {
            centerLat = firstLoc.lat;
            centerLng = firstLoc.lng;
            zoomLevel = 11;
        }
    }

    // Determine lighting based on theme
    let isDark = document.body.classList.contains('dark-mode');
    let currentLightPreset = isDark ? 'dusk' : 'dawn'; 

    myMap = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/standard', 
        center: [centerLng, centerLat],
        zoom: zoomLevel,
        pitch: 60 
    });

    myMap.on('style.load', () => {
        myMap.setConfigProperty('basemap', 'lightPreset', currentLightPreset);
        myMap.setConfigProperty('basemap', 'showPointofInterestLabels', false);
        renderMapPins();
    });
}

async function renderMapPins() {
    if (!myMap || !activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    mapMarkers.forEach(marker => marker.remove());
    mapMarkers = [];
    if (myMap.getSource('route')) {
        myMap.removeLayer('route');
        myMap.removeSource('route');
    }

    let bounds = new mapboxgl.LngLatBounds();
    let routeCoords = []; 
    let visibleSpots = currentTrip.locations.filter(spot => (activeFilterDay === 0 || spot.day === activeFilterDay) && (spot.lat && spot.lng));

    visibleSpots.sort((a, b) => {
        let dayA = a.day || a.start_day || 1;
        let dayB = b.day || b.start_day || 1;
        if (dayA !== dayB) return dayA - dayB;
        return (a.order_index || 0) - (b.order_index || 0);
    });

    visibleSpots.forEach(spot => {
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<b style="font-size: 14px; color: black;">[Day ${spot.day}] ${spot.name}</b><br><span style="color: gray; font-size: 12px;">${spot.category}</span>`
        );

        // CUSTOM PINS
        let markerElement = document.createElement('div');
        markerElement.style.width = '30px';
        markerElement.style.height = '30px';
        markerElement.style.display = 'flex';
        markerElement.style.justifyContent = 'center';
        markerElement.style.alignItems = 'center';
        markerElement.style.borderRadius = '50%';
        markerElement.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
        markerElement.style.cursor = 'pointer';
        markerElement.style.border = '2px solid white';
        
        if (spot.type === 'flight') {
            markerElement.style.background = 'transparent';
            markerElement.style.border = 'none';
            markerElement.style.boxShadow = 'none';
            markerElement.style.borderRadius = '0';
            
            let isArrival = spot.direction === 'arrival';
            let planeColor = isArrival ? '#4CAF50' : '#ff9800';
            let rotateDeg = isArrival ? '90deg' : '0deg'; 
            
            markerElement.innerHTML = `
                <div style="filter: drop-shadow(0px 8px 6px rgba(0,0,0,0.4)); transform: rotate(${rotateDeg}); transition: transform 0.3s; margin-top: -10px;">
                    <svg width="34" height="34" viewBox="0 0 256 256">
                        <path d="M246.35,116.34l-89.6-44.8L124.64,18A16,16,0,0,0,96,24v50.21L34.19,95.53A15.93,15.93,0,0,0,24,109.84V136a8,8,0,0,0,11.58,7.16L96,113V184l-27.18,20.39A15.91,15.91,0,0,0,62,217.18V232a8,8,0,0,0,12.8,6.4L128,198.4l53.2,40A8,8,0,0,0,194,232V217.18a15.91,15.91,0,0,0-6.82-12.81L160,184V113l81.82,40.91A8,8,0,0,0,256,146.74V123.5A8,8,0,0,0,246.35,116.34Z" 
                              fill="${planeColor}" stroke="white" stroke-width="12" stroke-linejoin="round"></path>
                    </svg>
                </div>
            `;
        } else if (spot.type === 'lodging') {
            markerElement.style.background = '#9c27b0';
            markerElement.innerHTML = `<svg width="18" height="18" fill="white" viewBox="0 0 256 256"><path d="M208,72H48A16,16,0,0,0,32,88v96a8,8,0,0,0,16,0V168H208v16a8,8,0,0,0,16,0V88A16,16,0,0,0,208,72ZM48,88H112v64H48Zm160,64H128V88h80ZM80,104a12,12,0,1,1-12,12A12,12,0,0,1,80,104Z"></path></svg>`;
        } else {
            markerElement.style.background = '#2196F3';
            markerElement.style.width = '14px';
            markerElement.style.height = '14px';
            markerElement.style.border = '3px solid white';
        }

        const marker = new mapboxgl.Marker({ element: markerElement, offset: [0, -15] })
            .setLngLat([spot.lng, spot.lat])
            .setPopup(popup)
            .addTo(myMap);

        mapMarkers.push(marker);
        bounds.extend([spot.lng, spot.lat]);
        routeCoords.push(`${spot.lng},${spot.lat}`);
    });

    if (visibleSpots.length > 0) {
        myMap.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }

    // Draw driving/walking route
    if (routeCoords.length > 1 && routeCoords.length <= 25) { 
        try {
            let coordString = routeCoords.join(';');
            
            let dirRes = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${currentRouteMode}/${coordString}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`);
            let dirData = await dirRes.json();

            if (dirData.routes && dirData.routes.length > 0) {
                myMap.addSource('route', {
                    'type': 'geojson',
                    'data': { 'type': 'Feature', 'properties': {}, 'geometry': dirData.routes[0].geometry }
                });

                myMap.addLayer({
                    'id': 'route',
                    'type': 'line',
                    'source': 'route',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 
                        'line-color': '#470a44', 
                        'line-width': 5, 
                        'line-opacity': 0.8,
                        'line-emissive-strength': 1 
                    }
                });
            }
        } catch (error) { console.error("Mapbox routing error:", error); }
    }
}

// ==========================================
// ENGINE 7, 8 & 9: AI INTEGRATION (SUPABASE MEMORY)
// ==========================================
let aiToggleBtn = document.getElementById('ai-toggle-btn');
let aiChatWindow = document.getElementById('ai-chat-window');
let aiCloseBtn = document.getElementById('ai-close-btn');

// The active memory array send to Netlify server
let aiConversationHistory = [];

aiToggleBtn.addEventListener('click', async () => { 
    if (!activeTripId) return alert("Please open a trip first!");
    aiChatWindow.style.display = 'flex'; 
    aiToggleBtn.style.display = 'none'; 
    await loadChatHistory();
});

aiCloseBtn.addEventListener('click', () => { 
    aiChatWindow.style.display = 'none'; 
    aiToggleBtn.style.display = 'block'; 
});

function appendMessage(role, text) {
    if (role === 'system') return;
    
    let msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', role === 'user' ? 'user-message' : 'ai-message');
    msgDiv.innerHTML = role === 'user' ? text : text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    document.getElementById('ai-chat-history').appendChild(msgDiv);
    document.getElementById('ai-chat-history').scrollTop = document.getElementById('ai-chat-history').scrollHeight;
}

async function loadChatHistory() {
    let historyUI = document.getElementById('ai-chat-history');
    historyUI.innerHTML = `<div class="chat-message ai-message">Connecting to memory banks...</div>`;
    aiConversationHistory = []; 

    // Pull every message attached to this specific trip
    const { data, error } = await supabaseClient
        .from('trip_chats')
        .select('*')
        .eq('trip_id', activeTripId)
        .order('created_at', { ascending: true });

    historyUI.innerHTML = ""; 

    if (data && data.length > 0) {
        // Rebuild history array and UI if data exists
        data.forEach(msg => {
            aiConversationHistory.push({ role: msg.role, content: msg.content });
            appendMessage(msg.role, msg.content);
        });
    } else {
        let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
        let sysPrompt = `You are an expert travel guide for ${currentTrip.destination}. The user's name is Ohm. They are a vegetarian (no meat or fish, but eggs are okay). Strictly tailor all restaurant and food recommendations to this diet. Keep responses conversational and under 3 sentences.`;
        
        await supabaseClient.from('trip_chats').insert({ trip_id: activeTripId, role: 'system', content: sysPrompt });
        
        aiConversationHistory.push({ role: 'system', content: sysPrompt });
        appendMessage("assistant", "Hi! I'm your local guide. I have my memory fully synced. What do you want to know about this trip?");
    }
}

async function sendToGroq(userText) {
    let typingId = "typing-" + Date.now();
    let typingDiv = document.createElement('div'); 
    typingDiv.classList.add('chat-message', 'ai-message'); 
    typingDiv.id = typingId; 
    typingDiv.innerText = "Thinking...";
    document.getElementById('ai-chat-history').appendChild(typingDiv);
    
    try {
        // 1. Save user message to database
        await supabaseClient.from('trip_chats').insert({ trip_id: activeTripId, role: 'user', content: userText });
        aiConversationHistory.push({ role: "user", content: userText });

        // 2. Send full context array to Netlify function
        const response = await fetch("/.netlify/functions/chat", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ messages: aiConversationHistory }) 
        });
        
        document.getElementById(typingId).remove();
        if (!response.ok) return appendMessage("assistant", "Server error!");
        
        let responseData = await response.json();
        let aiResponseText = responseData.choices[0].message.content;

        // 3. Save AI response to database
        await supabaseClient.from('trip_chats').insert({ trip_id: activeTripId, role: 'assistant', content: aiResponseText });
        aiConversationHistory.push({ role: "assistant", content: aiResponseText });

        appendMessage("assistant", aiResponseText);
    } catch { 
        document.getElementById(typingId).remove(); 
        appendMessage("assistant", "Servers offline!"); 
    }
}

document.getElementById('ai-send-btn').addEventListener('click', () => {
    let text = document.getElementById('ai-user-input').value.trim();
    if (!text) return; 
    appendMessage('user', text); 
    document.getElementById('ai-user-input').value = ""; 
    sendToGroq(text);
});

document.getElementById('ai-user-input').addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') document.getElementById('ai-send-btn').click(); 
});

document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!activeTripId) return alert("Open a trip first!");
    let trip = masterTripsArray.find(t => t.id === activeTripId);
    if (!trip.locations?.length) return alert("Itinerary is empty!");
    
    aiChatWindow.style.display = 'flex'; 
    aiToggleBtn.style.display = 'none';
    
    // Load memory first 
    if (aiConversationHistory.length === 0) await loadChatHistory();
    
    appendMessage("assistant", "🔍 Scanning itinerary...");
    try {
        const response = await fetch("/.netlify/functions/analyze", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ tripData: trip }) 
        });
        if (!response.ok) return appendMessage("assistant", "Analyzer error!");
        
        let analysisText = (await response.json()).choices[0].message.content;
        let fullMsg = "📊 **ITINERARY ANALYSIS** 📊\n\n" + analysisText;
        
        // Push analysis into database so it's permanent 
        await supabaseClient.from('trip_chats').insert({ trip_id: activeTripId, role: 'assistant', content: fullMsg });
        aiConversationHistory.push({ role: "assistant", content: fullMsg });
        
        appendMessage("assistant", fullMsg);
    } catch { 
        appendMessage("assistant", "Analyzer offline!"); 
    }
});

// ==========================================
// ENGINE 10: HYPERLAPSE (MATH & CACHE)
// ==========================================

function generateRouteFingerprint(trip) {
    // Grab only valid locations
    let visibleSpots = trip.locations.filter(spot => spot.lat && spot.lng);
    visibleSpots.sort((a, b) => a.day - b.day);
    
    // Create string of coords
    return visibleSpots.map(spot => `${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`).join('|');
}

function sliceRouteIntoFrames(rawCoordinates) {
    console.log("1. Starting spatial math on route...");
    
    const routeLine = turf.lineString(rawCoordinates);
    const totalDistance = turf.length(routeLine, { units: 'kilometers' });
    
    let dynamicFrames = Math.floor(totalDistance / 1.5);
    const frameCount = Math.max(30, Math.min(dynamicFrames, 120));
    
    const frameSpacing = totalDistance / frameCount; 
    
    let cameraFrames = [];

    // Loop through line and slice
    for (let i = 0; i < totalDistance; i += frameSpacing) {
        if (cameraFrames.length >= frameCount) break; 

        let currentPoint = turf.along(routeLine, i, { units: 'kilometers' });
        
        let nextPoint = turf.along(routeLine, Math.min(i + 0.01, totalDistance), { units: 'kilometers' });
        let compassHeading = turf.bearing(currentPoint, nextPoint);
        
        cameraFrames.push({
            lng: currentPoint.geometry.coordinates[0],
            lat: currentPoint.geometry.coordinates[1],
            heading: compassHeading
        });
    }
    
    console.log(`2. Successfully sliced route into ${cameraFrames.length} evenly spaced frames.`);
    return cameraFrames;
}

function debugHyperlapseFrames(frames, urls) {
    console.log("DEBUG MODE: Plotting camera frames on the map...");
    
    frames.forEach((frame, index) => {
        const el = document.createElement('div');
        el.style.width = '8px';
        el.style.height = '8px';
        el.style.backgroundColor = '#ff0044';
        el.style.borderRadius = '50%';
        el.style.border = '1px solid white';
        el.style.cursor = 'pointer';

        const popup = new mapboxgl.Popup({ offset: 10 }).setHTML(`
            <div style="text-align: center; color: black;">
                <b style="font-size: 12px;">Frame ${index + 1}</b>
                <p style="font-size: 10px; color: gray; margin: 2px 0;">Heading: ${Math.round(frame.heading)}°</p>
                <a href="${urls[index]}" target="_blank" style="font-size: 10px; color: #2196F3; text-decoration: underline;">Open Raw Image</a>
            </div>
        `);

        new mapboxgl.Marker(el)
            .setLngLat([frame.lng, frame.lat])
            .setPopup(popup)
            .addTo(myMap);
    });
}

document.getElementById('btn-hyperlapse').addEventListener('click', async () => {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);

    const mapSource = myMap.getSource('route');
    if (!mapSource || !mapSource._data.geometry) {
        alert("Please let the map generate a route line first!");
        return;
    }

    let currentFingerprint = generateRouteFingerprint(currentTrip);
    let savedCache = JSON.parse(localStorage.getItem('hyperlapseCache') || '{}');

    if (savedCache.fingerprint === currentFingerprint && savedCache.imageUrls) {
        console.log("🟢 CACHE HIT! Playing video from memory...");
        playHyperlapse(savedCache.imageUrls);
        return;
    }

    console.log("🔴 CACHE MISS! Route is new or updated. Running math engine...");
    const rawMapboxCoords = mapSource._data.geometry.coordinates;
    let newFrames = sliceRouteIntoFrames(rawMapboxCoords);
    
    console.log("3. Sending coordinates to Google Cloud...");
    try {
        const response = await fetch("/.netlify/functions/hyperlapse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frames: newFrames })
        });

        if (!response.ok) throw new Error("Backend failed to process frames");
        
        const data = await response.json();
        console.log("4. Successfully received image URLs!");

        localStorage.setItem('hyperlapseCache', JSON.stringify({
            fingerprint: currentFingerprint,
            frames: newFrames,
            imageUrls: data.urls 
        }));

        console.log("🟢 NEW CACHE SAVED! Starting video...");
        debugHyperlapseFrames(newFrames, data.urls);
        playHyperlapse(data.urls);

    } catch (error) {
        console.error("Hyperlapse Generation Failed:", error);
        alert("Failed to generate hyperlapse images.");
    }
});

// ==========================================
// ENGINE 11: CANVAS MEDIA PLAYER
// ==========================================
let hlTimeout;
let isPlaying = true;
let playbackSpeed = 1;
let currentFrame = 0;
let loadedImages = [];

async function playHyperlapse(urls) {
    const modal = document.getElementById('hyperlapse-modal');
    const canvas = document.getElementById('hyperlapse-canvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('hyperlapse-status');
    const controlBar = document.getElementById('hyperlapse-controls');
    const scrubber = document.getElementById('hl-scrubber');
    
    // Reset state for new video
    isPlaying = true;
    currentFrame = 0;
    loadedImages = [];
    let loadedCount = 0;
    document.getElementById('hl-play-pause').innerText = "⏸";
    scrubber.max = urls.length - 1;
    scrubber.value = 0;
    
    modal.style.display = 'flex';
    controlBar.style.display = 'none'; 
    statusText.innerText = `Downloading ${urls.length} frames...`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. PRELOAD
    for (let i = 0; i < urls.length; i++) {
        let img = new Image();
        img.src = urls[i];
        
        img.onload = () => {
            loadedCount++;
            statusText.innerText = `Buffering: ${Math.floor((loadedCount / urls.length) * 100)}%`;
            if (loadedCount === urls.length) startPlayback();
        };
        img.onerror = () => {
            loadedCount++;
            if (loadedCount === urls.length) startPlayback();
        }
        loadedImages.push(img);
    }

    // 2. PLAYBACK 
    function startPlayback() {
        statusText.innerText = "▶ Cinematic Mode Active";
        controlBar.style.display = 'flex'; 
        
        if (hlTimeout) clearTimeout(hlTimeout);
        loop();
    }

    window.drawSingleFrame = function() {
        if (loadedImages[currentFrame] && loadedImages[currentFrame].complete && loadedImages[currentFrame].naturalHeight !== 0) {
            ctx.drawImage(loadedImages[currentFrame], 0, 0, canvas.width, canvas.height);
        }
        scrubber.value = currentFrame;
    };

    function loop() {
        if (!isPlaying) return; 
        
        window.drawSingleFrame();
        currentFrame++;
        
        if (currentFrame >= loadedImages.length) {
            currentFrame = 0; 
        }
        
        let dynamicDelay = 100 / playbackSpeed;
        
        clearTimeout(hlTimeout);
        hlTimeout = setTimeout(loop, dynamicDelay); 
    }

    // UI EVENT LISTENERS
    
    // Play/Pause Toggle
    document.getElementById('hl-play-pause').onclick = function() {
        isPlaying = !isPlaying;
        this.innerText = isPlaying ? "⏸" : "▶";
        if (isPlaying) loop();
    };

    scrubber.oninput = function(e) {
        isPlaying = false;
        document.getElementById('hl-play-pause').innerText = "▶";
        currentFrame = parseInt(e.target.value);
        window.drawSingleFrame(); 
    };

    document.getElementById('hl-speed').onchange = function(e) {
        playbackSpeed = parseFloat(e.target.value);
    };
}

document.getElementById('hyperlapse-close').addEventListener('click', () => {
    document.getElementById('hyperlapse-modal').style.display = 'none';
    isPlaying = false;
    if (hlTimeout) clearTimeout(hlTimeout);
});

renderDashboard();