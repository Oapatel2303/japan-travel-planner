// ==========================================
// STEP 1: GLOBAL HTML ELEMENTS
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

// --- BULLETPROOF SESSION HANDLER ---
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

    // MULTIPLAYER FETCH LOGIC
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

// 1. Force a session check instantly on page load
supabaseClient.auth.getSession().then(({ data: { session } }) => {
    initializeUserSession(session);
});

// 2. Listen for actual log in / log out clicks
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        initializeUserSession(session);
    }
});

async function syncTripToCloud(tripObject, isDelete = false) {
    if (!currentUser) return; 

    if (isDelete) {
        const { error } = await supabaseClient.from('trips').delete().eq('id', tripObject.id);
        if (error) console.error("Cloud delete failed:", error);
        return;
    }

    const payload = {
        id: tripObject.id,
        user_id: tripObject.owner_id || currentUser.id, 
        trip_data: { name: tripObject.name, destination: tripObject.destination, dates: tripObject.dates, days: tripObject.days, categories: tripObject.categories, locations: tripObject.locations }
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
    } else {
        console.log(`☁️ Trip '${tripObject.name}' successfully synced to cloud.`);
    }
}


// ==========================================
// ENGINE 00.5: USER PROFILE SYSTEM
// ==========================================

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

        // Load social data
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

    // Lock button
    btnSaveProfile.innerText = "Saving...";
    btnSaveProfile.disabled = true;
    document.getElementById('profile-avatar-preview').src = (avatarVal !== "") ? avatarVal : "https://ui-avatars.com/api/?name=User&background=random";

    try {
        // Send to Supabase
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
        // button ALWAYS unlocks even if an error occurs
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

// Global render function to refresh social data
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

        // Gather all friend profiles and count their trips
        for (let rel of friendships) {
            let friendId = (rel.requester_id === currentUser.id) ? rel.receiver_id : rel.requester_id;
            let { data: friend } = await supabaseClient.from('profiles').select('*').eq('id', friendId).single();
            
            if (friend) {
                // Ask Supabase to count how many trips this user owns
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

        // Sort friends so the ones with the MOST trips appear at the top!
        friendsData.sort((a, b) => b.tripCount - a.tripCount);

        // Render them to the UI
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
        .neq('id', currentUser.id) // Don't show self
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

    let newFolder = { 
        id: crypto.randomUUID(), 
        owner_id: currentUser ? currentUser.id : null,
        name: rawName, 
        destination: rawDest.toLowerCase().trim(), 
        dates: rawDates, 
        days: 1, 
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
        navHTML += `<button onclick="setDayFilter(${i})" class="day-btn ${isActive}">Day ${i}</button>`;
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

    currentTrip.locations.sort((a,b) => a.day - b.day);

    for (let i = 0; i < currentTrip.locations.length; i++) {
        let spot = currentTrip.locations[i]; 
        if (activeFilterDay !== 0 && spot.day !== activeFilterDay) continue;

        let cardColor = spot.visited ? "background-color: rgba(76, 175, 80, 0.15);" : ""; 
        let buttonText = spot.visited ? "visited!" : "mark as visited";
        tripTotal += spot.cost || 0; 

        allHTML += `
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
    }

    container.innerHTML = allHTML;
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

    let originalBtnText = addButton.innerText;
    addButton.innerText = "locating pin..."; addButton.disabled = true;

    let coords = await smartGeocode(nameInput, currentTrip.destination);
    if (coords.lat === 0 && coords.lng === 0) alert(`Saved to list! Map couldn't find exact GPS coordinates for "${nameInput}".`);

    let newLocation = {
        name: nameInput, day: cleanDayNum, category: categoryInput, notes: notesInput,
        visited: (editingIndex !== null) ? currentTrip.locations[editingIndex].visited : false,
        cost: parseFloat(priceInput) || 0, lat: coords.lat, lng: coords.lng  
    };

    if (editingIndex !== null) {
        currentTrip.locations[editingIndex] = newLocation;
        editingIndex = null; 
        addButton.style.backgroundColor = "var(--success-color)"; addButton.style.color = "white";
    } else {
        currentTrip.locations.push(newLocation);
    }

    addButton.innerText = "save location"; addButton.disabled = false;
    
    renderDayFilter(); renderLocations(); renderMapPins(); loadWeather(); syncTripToCloud(currentTrip);
    
    document.getElementById('new-name').value = ""; document.getElementById('new-day').value = "1"; document.getElementById('new-category').value = ""; document.getElementById('new-notes').value = ""; document.getElementById('new-price').value = ""; 
});

// ==========================================
// ENGINE 3: DATA MANAGEMENT (EXPORT/IMPORT/DELETE)
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
        let countryResponse = await fetch(`https://restcountries.com/v3.1/name/${currentTrip.destination}`);
        if (!countryResponse.ok) { rateTextElement.innerText = "unknown country"; return; }
        
        let targetCurrency = Object.keys((await countryResponse.json())[0].currencies)[0]; 
        rateTextElement.innerText = "fetching rate...";

        let rateData = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
        let rate = rateData.rates[targetCurrency];

        if (rate) {
            rateTextElement.innerText = `1 USD = ${rate.toFixed(2)} ${targetCurrency}`;
            rateTextElement.style.color = "var(--success-color)"; rateTextElement.style.fontWeight = "bold"; rateTextElement.style.fontSize = "24px"; rateTextElement.style.marginTop = "15px"; rateTextElement.style.display = "block"; 
        } else { rateTextElement.innerText = "rate not found"; }
    } catch (error) { rateTextElement.innerText = "api offline"; }
}

async function loadWeather() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    const weatherText = document.getElementById('weather-text');
    if (!currentTrip || !currentTrip.destination) { weatherText.innerText = "no destination"; return; }

    weatherText.innerText = "scanning regions..."; 
    let finalWeatherHTML = ""; let locationsToFetch = []; 

    try {
        let countryResponse = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(currentTrip.destination.toLowerCase())}`);
        if (countryResponse.ok) {
            let capital = (await countryResponse.json())[0].capital?.[0] || currentTrip.destination;
            let capGeoData = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(capital)}&count=1&language=en&format=json`)).json();
            if (capGeoData.results?.length > 0) locationsToFetch.push({ name: capital + " (Capital)", lat: capGeoData.results[0].latitude, lng: capGeoData.results[0].longitude });
        }

        let addedCount = 0;
        for (let spot of currentTrip.locations) {
            if (spot.lat && spot.lng && spot.lat !== 0 && addedCount < 2) {
                locationsToFetch.push({ name: spot.name.substring(0, 14) + (spot.name.length > 14 ? "..." : ""), lat: spot.lat, lng: spot.lng });
                addedCount++;
            }
        }

        if (locationsToFetch.length === 0) {
             let fallbackData = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(currentTrip.destination)}&count=1&language=en&format=json`)).json();
             if (fallbackData.results?.length > 0) locationsToFetch.push({ name: currentTrip.destination, lat: fallbackData.results[0].latitude, lng: fallbackData.results[0].longitude });
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

// ==========================================
// ENGINE 5: UI LIBRARIES & THEMES
// ==========================================
flatpickr("#modal-trip-dates", { mode: "range", dateFormat: "M j, Y", minDate: "today", showMonths: 1 });

let themeToggleBtn = document.getElementById('theme-toggle');
if (localStorage.getItem('myAppTheme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggleBtn.innerText = "☀️ Light Mode"; themeToggleBtn.style.color = "white";
}

themeToggleBtn.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    if (document.body.classList.contains('dark-mode')) {
        themeToggleBtn.innerText = "☀️ Light Mode"; themeToggleBtn.style.color = "white"; localStorage.setItem('myAppTheme', 'dark');
    } else {
        themeToggleBtn.innerText = "🌙 Dark Mode"; themeToggleBtn.style.color = "black"; localStorage.setItem('myAppTheme', 'light');
    }
});

// ==========================================
// ENGINE 7: LEAFLET.JS INTERACTIVE MAP
// ==========================================
let myMap = null; 
let currentRouteMode = "car"; 

document.querySelectorAll('.route-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.route-btn').forEach(b => b.classList.remove('route-btn-active'));
        this.classList.add('route-btn-active');
        currentRouteMode = this.getAttribute('data-mode');
        renderMapPins(); 
    });
});

async function initMap() {
    if (!activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    if (myMap !== null) { myMap.remove(); myMap = null; }

    try {
        let geoData = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(currentTrip.destination)}&count=1&language=en&format=json`)).json();
        let centerLat = 0, centerLng = 0, zoomLevel = 2; 
        if (geoData.results?.length > 0) { centerLat = geoData.results[0].latitude; centerLng = geoData.results[0].longitude; zoomLevel = 5; }

        myMap = L.map('map').setView([centerLat, centerLng], zoomLevel);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(myMap);
        L.Control.geocoder({ position: 'topright' }).addTo(myMap);
        renderMapPins();
    } catch (error) { console.error("Map init failed:", error); }
}

async function renderMapPins() {
    if (!myMap || !activeTripId) return;
    let currentTrip = masterTripsArray.find(t => t.id === activeTripId);
    myMap.eachLayer((layer) => { if (layer instanceof L.Marker || layer instanceof L.Polyline) myMap.removeLayer(layer); });

    let bounds = [], routeCoords = []; 
    let visibleSpots = currentTrip.locations.filter(spot => (activeFilterDay === 0 || spot.day === activeFilterDay) && (spot.lat && spot.lng));

    if (visibleSpots.length > 0) {
        let unvisited = [...visibleSpots];
        let currentSpot = unvisited.shift(); 
        drawPin(currentSpot);

        while (unvisited.length > 0) {
            let nearestIndex = 0, shortestDistance = Infinity;
            for (let i = 0; i < unvisited.length; i++) {
                let dist = myMap.distance([currentSpot.lat, currentSpot.lng], [unvisited[i].lat, unvisited[i].lng]);
                if (dist < shortestDistance) { shortestDistance = dist; nearestIndex = i; }
            }
            currentSpot = unvisited.splice(nearestIndex, 1)[0];
            drawPin(currentSpot);
        }
    }

    function drawPin(spot) {
        L.marker([spot.lat, spot.lng]).addTo(myMap).bindPopup(`<b style="font-size: 14px;">[Day ${spot.day}] ${spot.name}</b><br><span style="color: gray; font-size: 12px;">${spot.category}</span>`);
        bounds.push([spot.lat, spot.lng]); routeCoords.push([spot.lat, spot.lng]);
    }

    if (routeCoords.length > 1) {
        try {
            let data = await (await fetch(`https://routing.openstreetmap.de/routed-${currentRouteMode}/route/v1/driving/${routeCoords.map(c => `${c[1]},${c[0]}`).join(';')}?overview=full&geometries=geojson`)).json();
            if (data.routes?.length > 0) L.polyline(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), { color: '#2196F3', weight: 5, opacity: 0.8, lineJoin: 'round' }).addTo(myMap);
            else throw new Error("No route");
        } catch { L.polyline(routeCoords, { color: '#2196F3', weight: 4, opacity: 0.8, dashArray: '10, 10' }).addTo(myMap); }
    }
    if (bounds.length > 0) myMap.fitBounds(bounds, { padding: [50, 50] });
}

// ==========================================
// ENGINE 8 & 9 & 10: AI INTEGRATION
// ==========================================
let aiToggleBtn = document.getElementById('ai-toggle-btn');
let aiChatWindow = document.getElementById('ai-chat-window');
let aiCloseBtn = document.getElementById('ai-close-btn');

aiToggleBtn.addEventListener('click', () => { aiChatWindow.style.display = 'flex'; aiToggleBtn.style.display = 'none'; });
aiCloseBtn.addEventListener('click', () => { aiChatWindow.style.display = 'none'; aiToggleBtn.style.display = 'block'; });

function resetChatWidget() {
    let history = document.getElementById('ai-chat-history');
    if (history) history.innerHTML = `<div class="chat-message ai-message">Hi! I'm your local guide. What do you want to know about this trip?</div>`;
    document.getElementById('ai-user-input').value = ""; 
    aiChatWindow.style.display = 'none'; aiToggleBtn.style.display = 'block';
}

function appendMessage(role, text) {
    let msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', role === 'user' ? 'user-message' : 'ai-message');
    msgDiv.innerHTML = role === 'user' ? text : text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    document.getElementById('ai-chat-history').appendChild(msgDiv);
    document.getElementById('ai-chat-history').scrollTop = document.getElementById('ai-chat-history').scrollHeight;
}

async function sendToGroq(userText) {
    let typingId = "typing-" + Date.now();
    let typingDiv = document.createElement('div'); typingDiv.classList.add('chat-message', 'ai-message'); typingDiv.id = typingId; typingDiv.innerText = "Thinking...";
    document.getElementById('ai-chat-history').appendChild(typingDiv);
    
    try {
        let dest = activeTripId ? masterTripsArray.find(t => t.id === activeTripId)?.destination : "a general vacation";
        const response = await fetch("/.netlify/functions/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: `You are an expert guide for ${dest}. Keep it under 3 sentences.` }, { role: "user", content: userText }] }) });
        document.getElementById(typingId).remove();
        if (!response.ok) return appendMessage("ai", "Server error!");
        appendMessage("ai", (await response.json()).choices[0].message.content);
    } catch { document.getElementById(typingId).remove(); appendMessage("ai", "Servers offline!"); }
}

document.getElementById('ai-send-btn').addEventListener('click', () => {
    let text = document.getElementById('ai-user-input').value.trim();
    if (!text) return; appendMessage('user', text); document.getElementById('ai-user-input').value = ""; sendToGroq(text);
});
document.getElementById('ai-user-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('ai-send-btn').click(); });

document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!activeTripId) return alert("Open a trip first!");
    let trip = masterTripsArray.find(t => t.id === activeTripId);
    if (!trip.locations?.length) return appendMessage("ai", "Itinerary is empty!");
    appendMessage("ai", "🔍 Scanning itinerary...");
    try {
        const response = await fetch("/.netlify/functions/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripData: trip }) });
        if (!response.ok) return appendMessage("ai", "Analyzer error!");
        appendMessage("ai", "📊 **ITINERARY ANALYSIS** 📊<br><br>" + (await response.json()).choices[0].message.content);
    } catch { appendMessage("ai", "Analyzer offline!"); }
});

renderDashboard();