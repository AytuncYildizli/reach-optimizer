window.YTD.tweets.part0 = [
  {
    "tweet": {
      "id_str": "1001",
      "full_text": "Shipped the import path https://t.co/abc https://t.co/pic",
      "user": { "screen_name": "aytunc", "id_str": "42" },
      "created_at": "Mon Jan 15 09:00:00 +0000 2024",
      "lang": "en",
      "entities": {
        "urls": [
          { "url": "https://t.co/abc", "expanded_url": "https://example.com/post", "display_url": "example.com/post" },
          { "url": "https://t.co/pic", "expanded_url": "https://x.com/aytunc/status/1001/photo/1", "display_url": "pic.x.com/pic" }
        ],
        "media": [{ "type": "photo" }]
      },
      "extended_entities": { "media": [{ "type": "photo" }] }
    }
  },
  {
    "tweet": {
      "id_str": "1002",
      "full_text": "RT @someone: not my post",
      "created_at": "Tue Jan 16 09:00:00 +0000 2024",
      "lang": "en"
    }
  },
  {
    "tweet": {
      "id_str": "1003",
      "full_text": "@someone thanks for the note",
      "created_at": "Wed Jan 17 09:00:00 +0000 2024",
      "in_reply_to_status_id_str": "55",
      "in_reply_to_screen_name": "someone",
      "lang": "en"
    }
  },
  {
    "tweet": {
      "id_str": "1004",
      "full_text": "Second part, still me",
      "created_at": "Thu Jan 18 09:00:00 +0000 2024",
      "in_reply_to_status_id_str": "1001",
      "in_reply_to_screen_name": "Aytunc",
      "lang": "en"
    }
  },
  {
    "tweet": {
      "id_str": "1005",
      "full_text": "Quoting a post I want people to see https://t.co/qtlink https://t.co/extlnk",
      "created_at": "Fri Jan 19 09:00:00 +0000 2024",
      "is_quote_status": true,
      "quoted_status_id_str": "77",
      "lang": "en",
      "entities": {
        "urls": [
          { "url": "https://t.co/qtlink", "expanded_url": "https://x.com/someone/status/77", "display_url": "x.com/someone/status/77" },
          { "url": "https://t.co/extlnk", "expanded_url": "https://example.com/story", "display_url": "example.com/story" }
        ]
      }
    }
  },
  {
    "tweet": {
      "id_str": "1006",
      "full_text": "This one has no metrics file row",
      "created_at": "Sat Jan 20 09:00:00 +0000 2024",
      "lang": "en"
    }
  }
]
