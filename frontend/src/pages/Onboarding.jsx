import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { MapPinLine, Train, Car, Coins, Lightning, ClockCountdown, PiggyBank, Leaf, Cloud, Sneaker, MapPin, ArrowRight } from '@phosphor-icons/react';
import './Onboarding.css';

const Onboarding = () => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const navigate = useNavigate();
    const { setLocationEnabled } = useParking();
    
    const handleEnableLocation = () => {
        const existingChoice = localStorage.getItem('locationPermissionChoice');
        if (existingChoice) {
            proceedWithLocation(existingChoice !== 'this_time' && existingChoice !== 'dont_allow');
        } else {
            setShowLocationModal(true);
        }
    };

    const proceedWithLocation = (shouldEnable) => {
        if (shouldEnable && "geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                () => {
                    setLocationEnabled(true);
                    navigate('/selection');
                },
                () => {
                    setLocationEnabled(false);
                    navigate('/selection');
                }
            );
        } else {
            setLocationEnabled(false);
            navigate('/selection');
        }
    };

    const handlePermissionChoice = (choice) => {
        if (choice !== 'this_time') {
            localStorage.setItem('locationPermissionChoice', choice);
        }
        setShowLocationModal(false);
        proceedWithLocation(choice !== 'dont_allow');
    };


    const slides = [
        {
            id: 'splash',
            content: (
                <div className="splash-content" style={{textAlign: 'center', padding: '2rem'}}>
                    <img src="/assets/welcome_simple.png" alt="Willkommen" style={{width: '240px', marginBottom: '2rem', borderRadius: 'var(--radius-lg)'}} />
                    <h1 className="logo-text">Park<span>IQ</span></h1>
                    <p className="tagline">Smart Park & Ride</p>
                    <p className="sub-tagline">Planen Sie Ihre optimale Park- und ÖPNV-Route</p>
                </div>
            )
        },
        {
            title: "Intelligente Park-and-Ride-Entscheidungen",
            desc: "Finden Sie günstige Parkplätze und die beste ÖPNV-Verbindung zu Ihrem Ziel.",
            illustration: (
               <div className="mock-map-ui">
                   <div className="mock-map-path"></div>
                   <div className="mock-map-pin start"><Car weight="fill" /></div>
                   <div className="mock-map-pin parking" style={{background: '#3b82f6'}}><span style={{fontWeight:'bold'}}>P</span></div>
                   <div className="mock-map-pin train"><Train weight="fill" /></div>
                   <div className="mock-map-pin end"><MapPin weight="fill" /></div>
               </div>
            )
        },
        {
            title: "Smarte Empfehlungen",
            desc: "Park-and-Ride-Optionen basierend auf Kosten und Zeit.",
            illustration: (
               <div className="recommendation-cards">
                   <div className="rec-card best-price">
                       <div className="rec-icon"><Coins weight="fill" /></div>
                       <div className="rec-info">
                           <h4>Bester Preis</h4>
                           <p>€ 5.35</p>
                       </div>
                   </div>
                   <div className="rec-card fastest">
                       <div className="rec-icon"><Lightning weight="fill" /></div>
                       <div className="rec-info">
                           <h4>Am schnellsten</h4>
                           <p>45 min</p>
                       </div>
                   </div>
               </div>
            )
        },
        {
            title: "Zeit und Geld sparen",
            desc: "Optimierte Entscheidungen für effizientes Reisen.",
            illustration: (
               <div className="money-time-graphic" style={{alignSelf: 'center', marginTop: '2rem'}}>
                   <div className="circle pulse">
                       <ClockCountdown weight="fill" />
                   </div>
                   <div className="circle pulse delay-1">
                       <PiggyBank weight="fill" />
                   </div>
               </div>
            )
        },
        {
            title: "Umweltfreundliches Parken",
            desc: "Durch die Kombination von Auto und ÖPNV reduzieren Sie Ihre CO2-Emissionen pro Fahrt erheblich.",
            illustration: (
               <div className="eco-graphic" style={{alignSelf: 'center', marginTop: '3rem'}}>
                   <Leaf weight="fill" className="main-eco-icon" />
                   <Cloud weight="fill" className="main-eco-cloud" />
               </div>
            )
        },
        {
            title: "Gesundes Pendeln",
            desc: "ParkIQ erfasst Ihre kurzen Fußwege zwischen den Stationen, damit Sie Ihr tägliches Schrittziel erreichen.",
            illustration: (
               <div className="health-graphic" style={{alignSelf: 'center', marginTop: '2rem'}}>
                   <Sneaker weight="fill" className="main-health-icon" />
                   <div className="step-dots">
                       <span></span><span></span><span></span><span></span>
                   </div>
               </div>
            )
        },
        {
            id: 'location',
            content: (
               <div className="location-prompt">
                   <div className="location-icon-wrapper">
                      <MapPin weight="fill" />
                   </div>
                    <h2 className="slide-title">Aktuellen Standort verwenden</h2>
                    <p className="slide-desc">Um Ihnen die besten Parkplätze anzuzeigen und die schnellste Route zu berechnen, benötigt ParkIQ Ihren Standort.</p>
                     <button className="btn btn-primary btn-large btn-glow" onClick={handleEnableLocation} style={{marginTop: '2rem'}}>Standort aktivieren</button>
                     <button className="btn btn-text" onClick={() => { setLocationEnabled(false); navigate('/selection'); }} style={{marginTop: '1rem'}}>Nicht jetzt</button>
               </div>
            )
        }
    ];

    return (
        <div className="view">
            <div className="onboarding-container">
                {slides.map((slide, index) => (
                    <div 
                        key={index} 
                        className={`slide ${index === currentSlide ? 'active' : ''} ${index < currentSlide ? 'prev' : ''}`}
                    >
                        {slide.content ? (
                            slide.content
                        ) : (
                            <>
                                <div className="slide-header">
                                    <h2 className="slide-title">{slide.title}</h2>
                                    <p className="slide-desc">{slide.desc}</p>
                                </div>
                                <div className="slide-illustration">
                                    {slide.illustration}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {currentSlide < slides.length - 1 && (
                <div className="onboarding-controls">
                    <div className="pagination-dots">
                        {slides.map((_, index) => (
                            <div key={index} className={`dot ${index === currentSlide ? 'active' : ''}`} />
                        ))}
                    </div>
                    <button className="icon-btn btn-next" onClick={() => setCurrentSlide(c => c + 1)}>
                        <ArrowRight weight="bold" />
                    </button>
                </div>
            )}

            {showLocationModal && (
                <div className="parking-sheet-overlay visible" onClick={() => setShowLocationModal(false)} style={{zIndex: 100, background: 'rgba(0,0,0,0.5)'}}>
                    <div className="parking-sheet expanded" onClick={e => e.stopPropagation()} style={{padding: '2rem', height: 'auto', bottom: 0}}>
                        <div style={{display: 'flex', justifyContent: 'center', marginBottom: '1rem'}}>
                            <div style={{background: 'var(--primary)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <MapPin weight="fill" size={24} />
                            </div>
                        </div>
                        <h3 style={{textAlign: 'center', marginBottom: '0.5rem', color: 'var(--text-main)'}}>Darf ParkIQ auf den Standort dieses Geräts zugreifen?</h3>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem'}}>
                            <button className="btn w-100" style={{background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', justifyContent: 'flex-start', padding: '1rem'}} onClick={() => handlePermissionChoice('all_time')}>
                                Immer erlauben
                            </button>
                            <button className="btn w-100" style={{background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', justifyContent: 'flex-start', padding: '1rem'}} onClick={() => handlePermissionChoice('dont_allow')}>
                                Nicht erlauben
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Onboarding;
