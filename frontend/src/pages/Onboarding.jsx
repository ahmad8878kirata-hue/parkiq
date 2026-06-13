import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParking } from '../context/ParkingContext';
import { MapPinLine, Train, Car, Coins, Lightning, ClockCountdown, PiggyBank, Leaf, Cloud, Sneaker, MapPin, ArrowRight } from '@phosphor-icons/react';
import './Onboarding.css';

const Onboarding = () => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const navigate = useNavigate();
    const { setLocationEnabled } = useParking();
    
    const handleEnableLocation = () => {
        if ("geolocation" in navigator) {
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

    const slides = [
        {
            id: 'splash',
            content: (
                <div className="splash-content" style={{textAlign: 'center', padding: '2rem'}}>
                    <img src="/assets/welcome_simple.png" alt="Welcome" style={{width: '240px', marginBottom: '2rem', borderRadius: 'var(--radius-lg)'}} />
                    <h1 className="logo-text">Park<span>IQ</span></h1>
                    <p className="tagline">Smart Park & Ride</p>
                    <p className="sub-tagline">Plan your optimal parking and transit route</p>
                </div>
            )
        },
        {
            title: "Smart Park-and-Ride Decisions",
            desc: "Find affordable parking and the best public transport connection to your destination.",
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
            title: "Smart Recommendations",
            desc: "Park-and-Ride options based on cost and time.",
            illustration: (
               <div className="recommendation-cards">
                   <div className="rec-card best-price">
                       <div className="rec-icon"><Coins weight="fill" /></div>
                       <div className="rec-info">
                           <h4>Best Price</h4>
                           <p>€ 5.35</p>
                       </div>
                   </div>
                   <div className="rec-card fastest">
                       <div className="rec-icon"><Lightning weight="fill" /></div>
                       <div className="rec-info">
                           <h4>Fastest</h4>
                           <p>45 min</p>
                       </div>
                   </div>
               </div>
            )
        },
        {
            title: "Save Time & Money",
            desc: "Optimized decisions for efficient travel.",
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
            title: "Eco-Friendly Parking",
            desc: "By combining driving and public transit, you significantly lower CO2 emissions per trip",
            illustration: (
               <div className="eco-graphic" style={{alignSelf: 'center', marginTop: '3rem'}}>
                   <Leaf weight="fill" className="main-eco-icon" />
                   <Cloud weight="fill" className="main-eco-cloud" />
               </div>
            )
        },
        {
            title: "Healthy Commute",
            desc: "ParkIQ tracks your short walks between points to help you reach your daily step goals",
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
                   <h2 className="slide-title">Use Your Current Location</h2>
                   <p className="slide-desc">To show you the best parking spots and calculate the fastest route, ParkIQ needs to know where you are.</p>
                    <button className="btn btn-primary btn-large btn-glow" onClick={handleEnableLocation} style={{marginTop: '2rem'}}>Enable Location</button>
                    <button className="btn btn-text" onClick={() => { setLocationEnabled(false); navigate('/selection'); }} style={{marginTop: '1rem'}}>Not now</button>
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
        </div>
    );
};

export default Onboarding;
