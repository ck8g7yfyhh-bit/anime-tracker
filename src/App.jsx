import React from 'react'
import AnimeTrackingCard from './AnimeTrackingCard'

function App() {
  // 1. 準備一筆測試用的動漫假資料
  const mockAnimeData = {
    mal_id: 52991,
    title: "葬送的芙莉蓮",
    imageUrl: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    episodes: 28,
    userStatus: 'watching',
    userProgress: 26
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* 2. 透過 anime={...} 把資料傳遞進去給卡片 */}
      <AnimeTrackingCard anime={mockAnimeData} />
    </div>
  )
}

export default App