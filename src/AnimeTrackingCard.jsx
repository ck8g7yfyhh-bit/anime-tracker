import React, { useState, useEffect, useMemo } from 'react';

const LIST_STATUS = {
  WATCHING: 'watching',    
  PLANNED: 'planned',      
  COMPLETED: 'completed'   
};

// --- AniList GraphQL API 設定 ---
const ANILIST_API_URL = 'https://graphql.anilist.co';

const fetchAniList = async (query, variables = {}) => {
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables
    })
  });
  
  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate Limit Exceeded");
    throw new Error(`AniList API Error: ${response.status}`);
  }
  return response.json();
};

const stripHtml = (html) => {
  if (!html) return '暫無劇情簡介。';
  return html.replace(/<[^>]*>?/gm, '');
};

const formatAniListAnime = (media) => {
  let bDayIndex = null;
  if (media.nextAiringEpisode?.airingAt) {
    const date = new Date(media.nextAiringEpisode.airingAt * 1000);
    const jsDay = date.getDay();
    bDayIndex = jsDay === 0 ? 6 : jsDay - 1;
  }

  const formattedScore = media.averageScore ? (media.averageScore / 10).toFixed(1) : 'N/A';

  return {
    id: media.id,
    title: media.title.native || media.title.romaji || media.title.english,
    originalName: media.title.english || media.title.romaji,
    imageUrl: media.coverImage.extraLarge || media.coverImage.large || '',
    score: formattedScore,
    users: media.popularity || 0,
    rank: '--',
    eps: media.episodes || null,
    status: media.status ? media.status.replace(/_/g, ' ') : 'UNKNOWN',
    format: media.format || 'TV',
    tags: media.genres || [],
    year: media.seasonYear || '',
    season: media.season ? media.season.charAt(0).toUpperCase() + media.season.slice(1).toLowerCase() : '',
    broadcastDayIndex: bDayIndex,
    synopsis: stripHtml(media.description)
  };
};

const GENRE_MAP = {
  '全部': '', 'Action': '動作', 'Adventure': '冒險', 'Comedy': '喜劇', 
  'Drama': '劇情', 'Fantasy': '奇幻', 'Romance': '戀愛', 'Sci-Fi': '科幻', 
  'Slice of Life': '日常', 'Sports': '運動', 'Supernatural': '超自然', 
  'Mystery': '懸疑', 'Mecha': '機甲', 'Suspense': '懸疑', 'Ecchi': '微色情'
};

const UI_GENRES = ['全部', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports'];
// 修改年份範圍：2026 到 2011，並加上 2010 以前
const UI_YEARS = ['全部', ...Array.from({length: 16}, (_, i) => (2026 - i).toString()), '2010以前'];
const UI_SEASONS = ['全部', 'Winter', 'Spring', 'Summer', 'Fall'];

const translateGenre = (enGenre) => GENRE_MAP[enGenre] || enGenre;

export default function App() {
  const [currentPage, setCurrentPage] = useState('home'); 
  const [searchQuery, setSearchQuery] = useState('');
  
  const [allSeasonAnime, setAllSeasonAnime] = useState([]);
  const [isHomeLoading, setIsHomeLoading] = useState(true);
  
  const [myPlaylist, setMyPlaylist] = useState(() => {
    const saved = localStorage.getItem('animePlaylist');
    return saved ? JSON.parse(saved) : [];
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('animePlaylist', JSON.stringify(myPlaylist));
  }, [myPlaylist]);

  const handleAddToList = (anime, status = LIST_STATUS.PLANNED) => {
    const existingIndex = myPlaylist.findIndex(item => item.id === anime.id);
    if (existingIndex === -1) {
      setMyPlaylist([...myPlaylist, { ...anime, watched: 0, eps: anime.eps || 12, status }]);
      alert(`已將《${anime.title}》加入${status === LIST_STATUS.PLANNED ? '待播清單' : '播放清單'}！`);
    } else {
      alert(`《${anime.title}》已經在您的清單中囉！`);
    }
  };

  const handleChangeStatus = (animeId, newStatus) => {
    setMyPlaylist(prevList => prevList.map(anime => anime.id === animeId ? { ...anime, status: newStatus } : anime));
  };

  const handleRemoveFromList = (animeId) => {
    if(window.confirm('確定要從清單中移除這部動漫嗎？')) {
      setMyPlaylist(prevList => prevList.filter(anime => anime.id !== animeId));
    }
  };

  const handleUpdateProgress = (animeId, episodeNumber) => {
    setMyPlaylist(prevList => 
      prevList.map(anime => {
        if (anime.id === animeId) {
          const newWatched = anime.watched === episodeNumber ? episodeNumber - 1 : episodeNumber;
          let newStatus = anime.status;
          if (newWatched === anime.eps) newStatus = LIST_STATUS.COMPLETED;
          else if (newWatched > 0 && newWatched < anime.eps) newStatus = LIST_STATUS.WATCHING;
          return { ...anime, watched: newWatched, status: newStatus };
        }
        return anime;
      })
    );
  };

  const handleOpenModal = async (baseAnime) => {
    setIsModalOpen(true);
    setIsModalLoading(true);
    try {
      const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            description(asHtml: false)
            startDate { year month day }
            rankings { rank type }
            episodes
            characters(sort: [ROLE, RELEVANCE], perPage: 8) {
              edges {
                node { id name { full } image { large } }
                voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } }
              }
            }
          }
        }
      `;
      
      const res = await fetchAniList(query, { id: baseAnime.id });
      const detail = res.data.Media;
      
      const ratedRankInfo = detail.rankings?.find(r => r.type === 'RATED');
      const displayRank = ratedRankInfo ? ratedRankInfo.rank : baseAnime.rank;

      const formattedCharacters = detail.characters?.edges.map(edge => ({
        id: edge.node.id,
        name: edge.node.name.full,
        image: edge.node.image?.large,
        actorName: edge.voiceActors && edge.voiceActors.length > 0 ? edge.voiceActors[0].name.full : '未知'
      })) || [];

      const airDateStr = detail.startDate?.year ? `${detail.startDate.year}-${String(detail.startDate.month).padStart(2, '0')}-${String(detail.startDate.day).padStart(2, '0')}` : '未知';

      const fullData = {
        ...baseAnime,
        summary: detail.description ? stripHtml(detail.description) : '暫無劇情簡介。',
        airDate: airDateStr,
        rank: displayRank,
        eps: detail.episodes || baseAnime.eps || 12,
        characters: formattedCharacters
      };

      setModalData(fullData);
      setMyPlaylist(prev => prev.map(item => item.id === baseAnime.id ? { ...item, eps: fullData.eps } : item));
    } catch (error) {
      setModalData({ ...baseAnime, summary: '資料載入失敗。請確認網路連線。' });
    } finally {
      setIsModalLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchAllSeasonData = async () => {
      setIsHomeLoading(true);
      try {
        const d = new Date();
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        let season = 'WINTER';
        if (month >= 4 && month <= 6) season = 'SPRING';
        else if (month >= 7 && month <= 9) season = 'SUMMER';
        else if (month >= 10 && month <= 12) season = 'FALL';

        const query = `
          query ($season: MediaSeason, $year: Int) {
            Page(page: 1, perPage: 50) {
              media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false, countryOfOrigin: "JP", format_in: [TV, ONA, MOVIE, OVA]) {
                id
                title { romaji english native }
                coverImage { large extraLarge }
                averageScore
                popularity
                episodes
                status
                format
                genres
                season
                seasonYear
                nextAiringEpisode { airingAt }
              }
            }
          }
        `;
        
        const resData = await fetchAniList(query, { season, year });
        if (isMounted && resData.data) {
          const formattedList = resData.data.Page.media.map(formatAniListAnime);
          setAllSeasonAnime(formattedList);
        }
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        if (isMounted) setIsHomeLoading(false);
      }
    };
    
    fetchAllSeasonData();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="h-screen w-screen bg-white text-gray-900 font-sans flex flex-col overflow-hidden selection:bg-gray-200 selection:text-black">
      
      {/* 導覽列：Logo 在左，搜尋居中，按鈕在右 */}
      <nav className="h-16 shrink-0 w-full bg-white flex items-center justify-between px-6 lg:px-12 z-40 border-b border-gray-100">
        <div className="flex items-center gap-12">
          <div onClick={() => setCurrentPage('home')} className="text-2xl font-black text-black cursor-pointer hover:opacity-80 transition-opacity tracking-tight">
            aniview
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="relative hidden sm:flex items-center group">
            <svg className="absolute left-3 w-4 h-4 text-gray-400 group-focus-within:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input 
              type="text" 
              placeholder="搜尋動漫..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value && currentPage === 'home') setCurrentPage('anime');
              }}
              className="bg-gray-50 text-sm text-gray-900 placeholder-gray-400 pl-9 pr-4 py-2 rounded-none w-48 md:w-64 focus:outline-none focus:bg-gray-100 transition-all"
            />
          </div>
          
          <div className="hidden md:flex gap-8 font-bold text-sm text-gray-400">
            <button onClick={() => setCurrentPage('anime')} className={`transition-colors ${currentPage === 'anime' ? 'text-black' : 'hover:text-black'}`}>
              所有動畫
            </button>
            <button onClick={() => setCurrentPage('profile')} className={`transition-colors ${currentPage === 'profile' ? 'text-black' : 'hover:text-black'}`}>
              個人首頁
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-hidden relative">
        {currentPage === 'home' && (
          <HomeView 
            allSeasonAnime={allSeasonAnime} 
            onAdd={handleAddToList} 
            onOpenModal={handleOpenModal}
            isLoading={isHomeLoading}
            setCurrentPage={setCurrentPage}
          />
        )}
        
        {currentPage === 'anime' && (
          <CatalogView 
            searchQuery={searchQuery}
            onAdd={handleAddToList} onOpenModal={handleOpenModal}
          />
        )}

        {currentPage === 'profile' && (
          <ProfileView 
            playlist={myPlaylist} onUpdateProgress={handleUpdateProgress}
            onChangeStatus={handleChangeStatus} onRemove={handleRemoveFromList} onOpenModal={handleOpenModal}
          />
        )}
      </main>

      {/* 詳細資訊 Modal - 極簡矩形無邊框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-none shadow-2xl flex flex-col md:flex-row">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 z-10 bg-gray-100 text-gray-500 hover:bg-black hover:text-white w-8 h-8 rounded-none flex items-center justify-center transition-colors">✕</button>

            {isModalLoading ? (
              <div className="w-full p-32 text-center text-gray-400 font-mono text-sm flex flex-col items-center">
                <svg className="animate-spin h-8 w-8 text-black mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Fetching data...
              </div>
            ) : modalData && (
              <>
                <div className="w-full md:w-[35%] bg-gray-50 p-8 flex flex-col items-center border-r border-gray-100">
                  <img src={modalData.imageUrl} alt="poster" className="w-full max-w-[220px] rounded-none shadow-md mb-6 bg-gray-200" />
                  
                  {(() => {
                    const inPlaylist = myPlaylist.find(item => item.id === modalData.id);
                    return inPlaylist ? (
                      <div className="w-full mb-6">
                        <div className="bg-white text-center py-2 font-bold text-gray-800 text-sm border-b border-gray-100 flex justify-between px-4">
                          <span>進度 ({inPlaylist.watched} / {modalData.eps || '?'})</span>
                          <span className="text-black font-medium">{inPlaylist.status === LIST_STATUS.COMPLETED ? '已看完' : inPlaylist.status === LIST_STATUS.PLANNED ? '待播中' : '觀看中'}</span>
                        </div>
                        <div className="bg-white p-3 flex gap-2 overflow-x-auto scrollbar-hide">
                          {Array.from({ length: modalData.eps || 12 }, (_, i) => i + 1).map(ep => (
                            <button
                              key={ep}
                              onClick={() => handleUpdateProgress(modalData.id, ep)}
                              className={`flex-none w-8 h-8 rounded-none text-xs font-bold transition-all ${
                                ep <= inPlaylist.watched ? 'bg-black text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-200'
                              }`}
                            >
                              {ep}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full flex flex-col gap-2 mb-6">
                        <button onClick={() => handleAddToList(modalData, LIST_STATUS.WATCHING)} className="w-full bg-black text-white hover:bg-gray-800 py-3 rounded-none font-bold transition-all text-sm">開始觀看</button>
                        <button onClick={() => handleAddToList(modalData, LIST_STATUS.PLANNED)} className="w-full bg-gray-100 text-black hover:bg-gray-200 py-3 rounded-none font-bold transition-all text-sm">加入待播清單</button>
                      </div>
                    );
                  })()}
                  
                  <div className="w-full space-y-3 text-sm text-gray-600 font-medium mt-auto">
                    <div className="flex justify-between pb-2 border-b border-gray-200"><span>評分</span><span className="text-black">{modalData.score} <StarIcon className="inline w-4 h-4 text-black -mt-1"/></span></div>
                    <div className="flex justify-between pb-2 border-b border-gray-200"><span>排名</span><span className="text-black">#{modalData.rank}</span></div>
                    <div className="flex justify-between pb-2 border-b border-gray-200"><span>總集數</span><span className="text-black">{modalData.eps || '?'} 集</span></div>
                    <div className="flex justify-between pb-2 border-b border-gray-200"><span>放送日期</span><span className="text-black">{modalData.airDate}</span></div>
                  </div>
                </div>

                <div className="w-full md:w-[65%] p-8 md:p-10 bg-white overflow-y-auto max-h-[90vh]">
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-none uppercase tracking-wider">{modalData.status}</span>
                      <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-none">{modalData.format}</span>
                    </div>
                    <h2 className="text-3xl font-black text-black mb-1 leading-tight">{modalData.title}</h2>
                    <p className="text-sm text-gray-400 mb-6 font-mono">{modalData.originalName}</p>
                    
                    <h3 className="text-sm font-bold text-black mb-2 uppercase tracking-wider">Synopsis</h3>
                    <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{modalData.summary}</p>
                  </div>

                  {modalData.characters && modalData.characters.length > 0 && (
                    <div className="mt-8 border-t border-gray-100 pt-8">
                      <h3 className="text-sm font-bold text-black mb-4 uppercase tracking-wider">Characters</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {modalData.characters.map(char => (
                          <div key={char.id} className="bg-gray-50 p-3 flex items-center gap-3 rounded-none transition-colors">
                            {char.image ? <img src={char.image} alt={char.name} className="w-10 h-10 rounded-none object-cover shrink-0" /> : <div className="w-10 h-10 rounded-none bg-gray-200 shrink-0"></div>}
                            <div className="overflow-hidden">
                              <p className="text-sm text-gray-900 font-bold truncate">{char.name}</p>
                              <p className="text-xs text-gray-500 truncate">CV: {char.actorName}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 子元件：首頁
// ==========================================
function HomeView({ allSeasonAnime, onAdd, onOpenModal, isLoading, setCurrentPage }) {
  const currentJS = new Date().getDay(); 
  const currentDayIndex = currentJS === 0 ? 6 : currentJS - 1; 
  const [activeTab, setActiveTab] = useState(currentDayIndex);
  
  const schedule = useMemo(() => {
    const daysZh = ['一', '二', '三', '四', '五', '六', '日'];
    const map = Array.from({ length: 7 }, (_, i) => ({ id: i, name: `周${daysZh[i]}`, items: [] }));
    const other = { id: 7, name: '其他 (完結/未定)', items: [] };
    
    allSeasonAnime.forEach(anime => {
        if (anime.broadcastDayIndex !== null && anime.broadcastDayIndex >= 0 && anime.broadcastDayIndex <= 6) {
            map[anime.broadcastDayIndex].items.push(anime);
        } else {
            other.items.push(anime);
        }
    });
    if (other.items.length > 0) map.push(other);
    return map;
  }, [allSeasonAnime]);

  const currentList = schedule.find(s => s.id === activeTab)?.items || [];
  
  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-white">
      <div className="w-full lg:w-[45%] h-full flex flex-col justify-center p-12 lg:pl-24 lg:pr-16 shrink-0 overflow-y-auto">
        <div className="max-w-md">
          <p className="text-sm font-medium text-gray-500 mb-6 flex items-center gap-2">
            Powered by AniList API <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2zm0 4.5l6.5 13h-13L12 6.5z"></path></svg>
          </p>
          
          <h1 className="text-5xl lg:text-7xl font-black tracking-tight text-black mb-6 font-mono">
            Aniview<br/>Tracker
          </h1>
          
          <p className="text-gray-600 text-base leading-relaxed mb-10">
            以純粹的黑白極簡主義，重新定義動漫追蹤體驗。
            <br/>專注於內容本身，無邊框、無干擾、極致流暢。
          </p>

          <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-10 text-sm font-medium text-gray-800">
            <div className="flex items-center gap-3"><CheckIcon /> 極簡無邊框視覺</div>
            <div className="flex items-center gap-3"><CheckIcon /> 豐富角色聲優庫</div>
            <div className="flex items-center gap-3"><CheckIcon /> 無縫離線儲存</div>
            <div className="flex items-center gap-3"><CheckIcon /> 純淨瀏覽體驗</div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentPage('anime')} className="bg-black text-white px-8 py-3 rounded-none font-bold text-sm hover:bg-gray-800 transition-colors">
              Explore
            </button>
            <button onClick={() => setCurrentPage('profile')} className="text-gray-600 font-bold text-sm flex items-center gap-2 hover:text-black transition-colors">
              My Profile <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[55%] h-full flex flex-col pt-8">
        <div className="px-8 mb-6 flex items-center">
          <div className="bg-gray-50 py-2 px-4 flex items-center gap-3 text-xs font-mono w-fit max-w-full overflow-hidden">
            <span className="bg-black text-white px-2 py-0.5 rounded-none text-[10px] font-black tracking-wide">POST</span>
            <span className="text-gray-600 truncate">graphql.anilist.co (query: $season, $year)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-16 scrollbar-hide">
          {!isLoading && allSeasonAnime.length > 0 && (
            <div className="flex gap-6 mb-6 overflow-x-auto scrollbar-hide pb-2">
              {schedule.map((day) => (
                <span 
                  key={day.id} 
                  onClick={() => setActiveTab(day.id)} 
                  className={`text-base cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === day.id ? 'text-black font-black' : 'text-gray-300 font-medium hover:text-gray-600'}`}
                >
                  {day.name} {day.id === currentDayIndex && <span className="text-[10px] opacity-80 ml-1 font-normal">(今日)</span>}
                </span>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="w-full h-64 flex flex-col items-center justify-center text-gray-400 space-y-4">
              <svg className="animate-spin h-8 w-8 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentList.map((anime) => (
                <AnimeCardHorizontal key={`hero-${anime.id}`} anime={anime} onAdd={() => onAdd(anime, LIST_STATUS.PLANNED)} onClick={() => onOpenModal(anime)} />
              ))}
              {currentList.length === 0 && (
                <div className="col-span-1 md:col-span-2 text-center py-12 text-gray-400 border border-gray-100 border-dashed rounded-none text-sm bg-white">
                  本日暫無動漫更新
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}

// ==========================================
// 子元件：橫向卡片 - 純直角無邊框設計
// ==========================================
function AnimeCardHorizontal({ anime, onClick, onAdd }) {
  return (
    <div className="flex gap-4 py-3 bg-white cursor-pointer relative group transition-opacity hover:opacity-80" onClick={onClick}>
      <img src={anime.imageUrl} alt={anime.title} className="w-[95px] h-[135px] object-cover rounded-none shrink-0 bg-gray-100" />
      <div className="flex flex-col flex-1 py-0.5 min-w-0 border-b border-gray-50 group-hover:border-transparent transition-colors">
        
        <div className={`text-[11px] font-bold mb-1 uppercase tracking-wide ${anime.status === 'RELEASING' ? 'text-orange-500' : 'text-gray-400'}`}>
          {anime.status}
        </div>
        
        <div className="text-[12px] text-gray-400 font-medium mb-1.5 flex items-center gap-2">
          {anime.season || anime.year ? <span>{anime.season} {anime.year}</span> : null}
          <span>{anime.eps ? `${anime.eps} eps` : '? eps'}</span>
        </div>
        
        <h3 className="text-[15px] font-bold text-black leading-tight line-clamp-2 pr-2 mb-2">
          {anime.title}
        </h3>
        
        <div className="flex items-center gap-5 mb-2 mt-auto">
          <div className="flex flex-col">
            <span className="text-[14px] text-black font-bold leading-none mb-1 flex items-center gap-1"><StarIcon className="w-3.5 h-3.5 text-black"/> {anime.score}</span>
            <span className="text-[10px] text-gray-400 leading-none">{anime.users ? (anime.users/1000).toFixed(1)+'k' : '0'} users</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {anime.tags?.slice(0, 2).map(tag => (
            <span key={tag} className="text-[10px] text-black bg-gray-100 font-bold px-1.5 py-0.5 rounded-none">
              {translateGenre(tag)}
            </span>
          ))}
        </div>
      </div>

      <button onClick={(e) => { e.stopPropagation(); onAdd(anime); }} className="absolute bottom-3 right-0 bg-gray-100 text-black w-8 h-8 rounded-none opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center font-bold hover:bg-black hover:text-white" title="加入待播清單">
        +
      </button>
    </div>
  );
}

// ==========================================
// 子元件：所有動畫 (搜尋與目錄) 
// ==========================================
function CatalogView({ searchQuery, onAdd, onOpenModal }) {
  const [activeFormat, setActiveFormat] = useState('TV');
  const [activeGenre, setActiveGenre] = useState('全部');
  const [activeSort, setActiveSort] = useState('SCORE_DESC');
  const [activeYear, setActiveYear] = useState('全部');
  const [activeSeason, setActiveSeason] = useState('全部');
  
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => { setPage(1); }, [searchQuery, activeGenre, activeSort, activeYear, activeSeason, activeFormat]);

  useEffect(() => {
    let isMounted = true;
    const fetchFilteredData = async () => {
      setIsLoading(true);
      try {
        const variables = { page };
        if (searchQuery) variables.search = searchQuery;
        if (activeGenre !== '全部') variables.genre = activeGenre;
        if (activeSeason !== '全部') variables.season = activeSeason.toUpperCase();
        
        // 處理 2010 以前的特殊邏輯
        if (activeYear !== '全部' && activeYear !== '2010以前') {
          variables.year = parseInt(activeYear);
        } else if (activeYear === '2010以前') {
          variables.startDate_lesser = 20110000; 
        }

        variables.sort = [activeSort];
        
        // 切換 Format (TV, OVA, MOVIE)
        variables.format_in = activeFormat === 'TV' ? ['TV', 'ONA'] : [activeFormat];

        const query = `
          query ($page: Int, $search: String, $genre: String, $season: MediaSeason, $year: Int, $sort: [MediaSort], $format_in: [MediaFormat], $startDate_lesser: Int) {
            Page(page: $page, perPage: 24) {
              pageInfo { hasNextPage }
              media(search: $search, genre: $genre, season: $season, seasonYear: $year, startDate_lesser: $startDate_lesser, type: ANIME, sort: $sort, isAdult: false, countryOfOrigin: "JP", format_in: $format_in) {
                id
                title { romaji english native }
                coverImage { large extraLarge }
                averageScore
                popularity
                episodes
                status
                format
                genres
                season
                seasonYear
              }
            }
          }
        `;

        const resData = await fetchAniList(query, variables);
        
        if (isMounted && resData.data) {
          const formatted = resData.data.Page.media.map(formatAniListAnime);
          setData(formatted);
          setHasNextPage(resData.data.Page.pageInfo.hasNextPage);
        }
      } catch (error) {
        console.error(error);
        if(isMounted) setData([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    
    const timeoutId = setTimeout(fetchFilteredData, 500);
    return () => { isMounted = false; clearTimeout(timeoutId); };
  }, [searchQuery, activeGenre, activeSort, activeYear, activeSeason, activeFormat, page]);

  return (
    <div className="h-full overflow-y-auto px-6 lg:px-16 py-10 pb-24 bg-white scrollbar-hide">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-black text-black mb-6 font-mono">
          Explore
          {searchQuery && <span className="text-lg text-gray-400 font-sans ml-4">/ Search: "{searchQuery}"</span>}
        </h1>
        
        <div className="flex gap-1 mb-8 border-b border-gray-100 pb-2">
          {['TV', 'OVA', 'MOVIE'].map(format => (
            <button
              key={format}
              onClick={() => setActiveFormat(format)}
              className={`px-6 py-2 text-sm font-bold transition-all rounded-none ${activeFormat === format ? 'bg-black text-white' : 'bg-transparent text-gray-400 hover:text-black'}`}
            >
              {format}
            </button>
          ))}
        </div>
        
        <div className="flex flex-col mb-10">
          <div className="flex flex-col gap-6 w-full">
            <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
              <span className="text-xs font-bold text-black uppercase tracking-wider shrink-0 w-12">Genre</span>
              <div className="flex gap-2 w-max">
                {UI_GENRES.map(g => (
                  <button key={`genre-${g}`} onClick={() => setActiveGenre(g)} className={`shrink-0 px-4 py-1.5 rounded-none text-xs font-bold transition-all whitespace-nowrap ${activeGenre === g ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {translateGenre(g)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
              <span className="text-xs font-bold text-black uppercase tracking-wider shrink-0 w-12">Year</span>
              <div className="flex gap-2 w-max">
                {UI_YEARS.map(y => (
                  <button 
                    key={`year-${y}`} 
                    onClick={() => { 
                      setActiveYear(y); 
                      if (y === '全部' || y === '2010以前') setActiveSeason('全部'); 
                    }} 
                    className={`shrink-0 px-4 py-1.5 rounded-none text-xs font-bold transition-all whitespace-nowrap ${activeYear === y ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className={`flex items-center gap-6 overflow-x-auto scrollbar-hide transition-opacity ${activeYear === '全部' || activeYear === '2010以前' ? 'opacity-20 pointer-events-none' : ''}`}>
              <span className="text-xs font-bold text-black uppercase tracking-wider shrink-0 w-12">Season</span>
              <div className="flex gap-2 w-max">
                {UI_SEASONS.map(s => (
                  <button key={`season-${s}`} onClick={() => setActiveSeason(s)} className={`shrink-0 px-4 py-1.5 rounded-none text-xs font-bold transition-all whitespace-nowrap ${activeSeason === s ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-6 mt-4">
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setActiveSort('SCORE_DESC')} className={`px-4 py-1.5 rounded-none text-xs font-bold transition-all border ${activeSort === 'SCORE_DESC' ? 'bg-black text-white border-black' : 'bg-transparent text-gray-400 border-gray-200 hover:border-black hover:text-black'}`}>Top Rated</button>
              <button onClick={() => setActiveSort('TRENDING_DESC')} className={`px-4 py-1.5 rounded-none text-xs font-bold transition-all border ${activeSort === 'TRENDING_DESC' ? 'bg-black text-white border-black' : 'bg-transparent text-gray-400 border-gray-200 hover:border-black hover:text-black'}`}>Trending Now</button>
              <button onClick={() => setActiveSort('START_DATE_DESC')} className={`px-4 py-1.5 rounded-none text-xs font-bold transition-all border ${activeSort === 'START_DATE_DESC' ? 'bg-black text-white border-black' : 'bg-transparent text-gray-400 border-gray-200 hover:border-black hover:text-black'}`}>Latest</button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-32 text-gray-400 font-mono text-sm flex flex-col items-center">
            <svg className="animate-spin h-6 w-6 text-black mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Querying AniList...
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-32 text-gray-400 bg-gray-50 border border-gray-100 border-dashed rounded-none text-sm">
            No results found.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
              {data.map((anime) => (
                <AnimeCardHorizontal key={`cat-${anime.id}`} anime={anime} onAdd={() => onAdd(anime, LIST_STATUS.PLANNED)} onClick={() => onOpenModal(anime)} />
              ))}
            </div>
            
            <div className="flex justify-center items-center gap-4 pt-4 border-t border-gray-100 mt-8">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-6 py-2 text-sm font-bold text-black disabled:text-gray-300 disabled:bg-transparent bg-gray-100 hover:bg-gray-200 transition-all rounded-none">PREV</button>
              <span className="text-sm font-mono text-black font-bold px-4 py-1.5">Page {page} {hasNextPage ? '...' : ''}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={!hasNextPage} className="px-6 py-2 text-sm font-bold text-black disabled:text-gray-300 disabled:bg-transparent bg-gray-100 hover:bg-gray-200 transition-all rounded-none">NEXT</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 子元件：個人清單專區
// ==========================================
function ProfileView({ playlist, onUpdateProgress, onRemove, onOpenModal }) {
  const [activeTab, setActiveTab] = useState(LIST_STATUS.WATCHING);
  const tabs = [
    { id: LIST_STATUS.WATCHING, label: 'Watching' },
    { id: LIST_STATUS.PLANNED, label: 'Plan to Watch' },
    { id: LIST_STATUS.COMPLETED, label: 'Completed' }
  ];
  const currentList = playlist.filter(item => item.status === activeTab);

  return (
    <div className="h-full overflow-y-auto px-6 lg:px-16 py-10 pb-24 bg-white scrollbar-hide">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-gray-100 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-black text-black mb-2 font-mono">My Profile</h1>
            <p className="text-gray-400 text-sm">
              Tracked: {playlist.length} | Completed: {playlist.filter(i => i.status === LIST_STATUS.COMPLETED).length}
            </p>
          </div>
          <div className="w-16 h-16 bg-black flex items-center justify-center text-2xl text-white font-bold font-mono rounded-none">
            M
          </div>
        </div>

        <div className="flex gap-8 mb-10 border-b border-gray-50 pb-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`pb-2 text-sm font-bold transition-colors relative ${activeTab === tab.id ? 'text-black' : 'text-gray-400 hover:text-black'}`}>
              {tab.label}
              <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-none ${activeTab === tab.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>{playlist.filter(i => i.status === tab.id).length}</span>
              {activeTab === tab.id && <div className="absolute -bottom-2 left-0 w-full h-0.5 bg-black"></div>}
            </button>
          ))}
        </div>

        {currentList.length === 0 ? (
          <div className="text-center py-24 bg-gray-50 border border-gray-100 border-dashed text-gray-400 text-sm font-mono rounded-none">
            List is empty.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {currentList.map(anime => (
              <div key={`profile-${anime.id}`} className="bg-white p-4 flex gap-4 relative group transition-all border border-gray-50 hover:border-gray-200">
                <img src={anime.imageUrl} alt="poster" className="w-[75px] h-[105px] object-cover rounded-none cursor-pointer shrink-0 bg-gray-100" onClick={() => onOpenModal(anime)} />
                <div className="flex-1 flex flex-col min-w-0">
                  <h3 className="font-bold text-sm text-black mb-1 truncate cursor-pointer hover:underline" onClick={() => onOpenModal(anime)}>{anime.title}</h3>
                  <p className="text-[10px] text-gray-400 font-mono mb-4">Total: {anime.eps || '?'} eps</p>
                  
                  <div className="mt-auto">
                    <div className="flex justify-between items-center text-[10px] mb-2 font-bold text-gray-400 uppercase tracking-wider">
                      <span>Progress</span>
                      <span className="text-black">{anime.watched} / {anime.eps || '?'}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-none h-1.5 mb-4 overflow-hidden">
                      <div className="bg-black h-full transition-all" style={{ width: `${Math.min(100, (anime.watched / (anime.eps || 12)) * 100)}%` }}></div>
                    </div>
                    
                    <div className="flex justify-end gap-2 mt-2">
                      {activeTab === LIST_STATUS.WATCHING && (
                        <button onClick={() => onUpdateProgress(anime.id, anime.watched + 1)} className="bg-gray-100 text-black px-3 py-1.5 rounded-none text-[10px] font-bold hover:bg-black hover:text-white transition-colors">+1 Episode</button>
                      )}
                      <button onClick={() => onRemove(anime.id)} className="text-gray-400 hover:text-white hover:bg-red-500 px-3 py-1.5 rounded-none text-[10px] font-bold transition-colors">Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 輔助 Icon 元件
function CheckIcon() {
  return <svg className="w-4 h-4 text-black shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>;
}
function StarIcon({className}) {
  return <svg className={className} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>;
}
