import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronRight, ChevronLeft } from 'lucide-react';
import { navItems } from './Sidebar';
import './BottomBar.css';

export default function BottomBar() {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const menuRefs = useRef({});
  const popupRef = useRef(null);
  const scrollRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isDropdownActive = (item) =>
    item.children?.some((child) => location.pathname === child.to);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const handleDropdownClick = (label) => {
    if (openDropdown === label) {
      setOpenDropdown(null);
      setPopupPos(null);
    } else {
      const el = menuRefs.current[label];
      if (el) {
        const rect = el.getBoundingClientRect();
        setPopupPos({
          bottom: window.innerHeight - rect.top + 8,
          left: rect.left + rect.width / 2,
        });
      }
      setOpenDropdown(label);
    }
  };

  useEffect(() => {
    setOpenDropdown(null);
    setPopupPos(null);
  }, [location.pathname]);

  useEffect(() => {
    const handleClick = (e) => {
      const clickedDropdown = Object.values(menuRefs.current).some(
        (ref) => ref && ref.contains(e.target)
      );
      const clickedPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!clickedDropdown && !clickedPopup) {
        setOpenDropdown(null);
        setPopupPos(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const nudgeScroll = (direction) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * 80, behavior: 'smooth' });
  };

  const openItem = openDropdown
    ? navItems.find((i) => i.label === openDropdown)
    : null;

  return (
    <div className="bottom-bar-wrapper">
      <nav className="bottom-bar" ref={scrollRef}>
        {navItems.map((item) =>
          item.children ? (
            <div
              key={item.label}
              className="bottom-bar-dropdown"
              ref={(el) => (menuRefs.current[item.label] = el)}
            >
              <div
                className={`bottom-bar-link ${isDropdownActive(item) ? 'bottom-bar-link--active' : ''}`}
                onClick={() => handleDropdownClick(item.label)}
              >
                <div className="bottom-bar-icon-wrap">
                  <item.icon size={22} />
                  <span className={`bottom-bar-badge ${openDropdown === item.label ? 'bottom-bar-badge--open' : ''}`}>
                    <ChevronUp size={12} />
                  </span>
                </div>
                <span>{item.label}</span>
              </div>
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `bottom-bar-link ${isActive ? 'bottom-bar-link--active' : ''}`
              }
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </NavLink>
          )
        )}
      </nav>

      {canScrollLeft && (
        <div className="bottom-bar-scroll-hint bottom-bar-scroll-hint--left" onClick={() => nudgeScroll(-1)}>
          <ChevronLeft size={16} />
        </div>
      )}

      {canScrollRight && (
        <div className="bottom-bar-scroll-hint bottom-bar-scroll-hint--right" onClick={() => nudgeScroll(1)}>
          <ChevronRight size={16} />
        </div>
      )}

      {openItem && popupPos && (
        <div
          className="bottom-bar-popup"
          ref={popupRef}
          style={{
            bottom: popupPos.bottom,
            left: popupPos.left,
            transform: 'translateX(-50%)',
          }}
        >
          {openItem.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                `bottom-bar-popup-item ${isActive ? 'bottom-bar-popup-item--active' : ''}`
              }
            >
              <child.icon size={16} />
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
