# Firebase to Supabase Migration Guide

## ✅ Step 1: Configuration Complete

### What's Done:
1. **Created `.env.local`** with Supabase credentials:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

2. **Updated `src/firebase/config.js`** → Now exports Supabase client:
   ```javascript
   export const supabase = createClient(supabaseUrl, supabaseAnonKey);
   ```

3. **Added package.json dependency**:
   - `@supabase/supabase-js: ^2.39.0`

---

## 📝 Step 2: Files That Need Updating

### Files importing Firebase:
1. `src/pages/Home.jsx` - Create queue operations
2. `src/pages/AdminDashboard.jsx` - Admin dashboard (read queues, analytics)
3. `src/pages/Display.jsx` - Real-time queue display
4. `src/pages/AdminSignup.jsx` - Authentication (signup)
5. `src/pages/AdminLogin.jsx` - Authentication (login)
6. `src/pages/AdminRequest.jsx` - Request management
7. `src/AnalyticsChart.jsx` - Analytics data

---

## 🔄 Migration Patterns

### Pattern 1: Authentication

**Firebase Code:**
```javascript
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";

// Signup
const userCredential = await createUserWithEmailAndPassword(auth, email, password);

// Login
const userCredential = await signInWithEmailAndPassword(auth, email, password);

// Logout
await signOut(auth);
```

**Supabase Code:**
```javascript
import { supabase } from "../firebase/config";

// Signup
const { data, error } = await supabase.auth.signUp({
  email: email,
  password: password
});

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: email,
  password: password
});

// Logout
await supabase.auth.signOut();
```

---

### Pattern 2: Create/Read Data

**Firebase Code:**
```javascript
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

// Create
await addDoc(collection(db, "queues"), {
  name: "Queue 1",
  timestamp: serverTimestamp(),
});

// Read all
const docs = await getDocs(collection(db, "queues"));

// Query
const q = query(collection(db, "queues"), where("status", "==", "active"));
const docs = await getDocs(q);
```

**Supabase Code:**
```javascript
import { supabase } from "../firebase/config";

// Create
const { data, error } = await supabase
  .from("queues")
  .insert([{ name: "Queue 1", created_at: new Date() }]);

// Read all
const { data, error } = await supabase
  .from("queues")
  .select("*");

// Query
const { data, error } = await supabase
  .from("queues")
  .select("*")
  .eq("status", "active");
```

---

### Pattern 3: Real-time Listeners

**Firebase Code:**
```javascript
import { onSnapshot } from "firebase/firestore";

const unsubscribe = onSnapshot(collection(db, "queues"), (snapshot) => {
  const queues = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  setQueues(queues);
});

// Cleanup
return () => unsubscribe();
```

**Supabase Code:**
```javascript
// Subscribe to changes
const subscription = supabase
  .from("queues")
  .on("*", (payload) => {
    // Re-fetch or update state
    console.log("Change received!", payload);
  })
  .subscribe();

// Cleanup
return () => subscription.unsubscribe();
```

---

### Pattern 4: Update/Delete Data

**Firebase Code:**
```javascript
import { doc, updateDoc, deleteDoc } from "firebase/firestore";

// Update
await updateDoc(doc(db, "queues", queueId), {
  status: "inactive",
  updatedAt: serverTimestamp(),
});

// Delete
await deleteDoc(doc(db, "queues", queueId));
```

**Supabase Code:**
```javascript
// Update
const { data, error } = await supabase
  .from("queues")
  .update({ status: "inactive", updated_at: new Date() })
  .eq("id", queueId);

// Delete
const { data, error } = await supabase
  .from("queues")
  .delete()
  .eq("id", queueId);
```

---

## 📊 Database Schema (To Be Created in Supabase)

Before migrating code, you need to create these tables in Supabase:

```sql
-- Queues table
CREATE TABLE queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  created_by TEXT
);

-- Slots/Tokens table
CREATE TABLE slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES queues(id),
  token_number INT,
  status TEXT DEFAULT 'waiting', -- waiting, served, no-show
  created_at TIMESTAMP DEFAULT now()
);

-- Admin profiles table
CREATE TABLE admin_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'admin', -- admin, super_admin
  created_at TIMESTAMP DEFAULT now()
);

-- Requests table
CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES queues(id),
  admin_email TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now()
);
```

---

## ✨ Next Steps

1. **✅ Configuration Done**
2. ⏳ **Create Supabase Database Schema** (Next)
3. ⏳ Migrate Firebase auth calls to Supabase auth
4. ⏳ Migrate Firestore calls to Supabase tables
5. ⏳ Set up real-time subscriptions
6. ⏳ Test all functionality
7. ⏳ Deploy to Vercel

---

## 🔗 Useful Resources

- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Database](https://supabase.com/docs/guides/database)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
