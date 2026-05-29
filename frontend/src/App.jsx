import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ParkingProvider } from './context/ParkingContext';
import Onboarding from './pages/Onboarding';
import Selection from './pages/Selection';
import Home from './pages/Home';
import Search from './pages/Search';
import Results from './pages/Results';

function App() {
  return (
    <ParkingProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Onboarding />} />
          <Route path="/selection" element={<Selection />} />
          <Route path="/home" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/results" element={<Results />} />
        </Routes>
      </Router>
    </ParkingProvider>
  );
}

export default App;
