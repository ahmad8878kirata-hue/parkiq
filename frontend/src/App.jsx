import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ParkingProvider } from './context/ParkingContext';

const Onboarding = lazy(() => import('./pages/Onboarding'));
const Selection = lazy(() => import('./pages/Selection'));
const Home = lazy(() => import('./pages/Home'));
const Search = lazy(() => import('./pages/Search'));
const Results = lazy(() => import('./pages/Results'));

function App() {
  return (
    <ParkingProvider>
      <Router>
        <Suspense fallback={<div className="view" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem',color:'var(--primary)'}}>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Onboarding />} />
            <Route path="/selection" element={<Selection />} />
            <Route path="/home" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/results" element={<Results />} />
          </Routes>
        </Suspense>
      </Router>
    </ParkingProvider>
  );
}

export default App;
