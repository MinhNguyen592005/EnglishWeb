ALTER TABLE lessons ADD COLUMN difficulty VARCHAR(20) NOT NULL DEFAULT 'BEGINNER';

UPDATE lessons SET difficulty='BEGINNER' WHERE topic_slug='conditionals' AND ordinal_no=0;
UPDATE lessons SET difficulty='INTERMEDIATE' WHERE topic_slug='conditionals' AND ordinal_no IN (1,2);
UPDATE lessons SET difficulty='ADVANCED' WHERE topic_slug='conditionals' AND ordinal_no=3;

UPDATE lessons SET title='Hiện tại đơn và hiện tại tiếp diễn',
  summary='Phân biệt thói quen với hành động đang diễn ra',
  theory='Hiện tại đơn diễn tả thói quen, lịch trình và sự thật: She studies every day. Với he, she, it, động từ thường thêm s hoặc es; câu phủ định dùng does not + động từ nguyên mẫu. Hiện tại tiếp diễn diễn tả hành động đang xảy ra: She is studying now. Công thức là am, is hoặc are + động từ thêm ing. Các từ often, usually, every day gợi ý hiện tại đơn; now, at the moment, look gợi ý hiện tại tiếp diễn.',
  difficulty='BEGINNER', published=TRUE
WHERE topic_slug='basic-tenses' AND ordinal_no=0;
INSERT INTO lessons(topic_slug,ordinal_no,title,summary,theory,difficulty,published) VALUES
('basic-tenses',1,'Quá khứ đơn và quá khứ tiếp diễn','Kể sự kiện đã xong và hành động đang xảy ra trong quá khứ',
 'Quá khứ đơn diễn tả sự kiện hoàn tất tại thời điểm xác định: I visited Hue yesterday. Động từ có quy tắc thêm ed; động từ bất quy tắc dùng dạng quá khứ như go thành went. Câu hỏi và phủ định dùng did và động từ nguyên mẫu. Quá khứ tiếp diễn là was hoặc were + động từ thêm ing, diễn tả hành động đang xảy ra tại một thời điểm trong quá khứ. When thường nối hành động ngắn cắt ngang hành động dài: I was reading when the phone rang. While thường đi với hành động đang diễn ra.',
 'INTERMEDIATE',TRUE);

UPDATE lessons SET title='Bị động ở hiện tại và quá khứ đơn',
  summary='Chuyển trọng tâm từ người làm sang đối tượng chịu tác động',
  theory='Câu bị động nhấn mạnh đối tượng chịu tác động. Công thức chung là be + quá khứ phân từ. Hiện tại đơn: am, is, are + quá khứ phân từ; ví dụ English is spoken here. Quá khứ đơn: was, were + quá khứ phân từ; ví dụ The bridge was built in 1990. Chọn is hoặc was cho chủ ngữ số ít, are hoặc were cho số nhiều. Chỉ thêm by + người thực hiện khi thông tin đó quan trọng.',
  difficulty='INTERMEDIATE', published=TRUE
WHERE topic_slug='passive-voice' AND ordinal_no=0;
INSERT INTO lessons(topic_slug,ordinal_no,title,summary,theory,difficulty,published) VALUES
('passive-voice',1,'Bị động ở tương lai và hiện tại hoàn thành','Dùng will be và have been đúng ngữ cảnh',
 'Bị động tương lai đơn có công thức will be + quá khứ phân từ: The results will be announced tomorrow. Bị động hiện tại hoàn thành có công thức has hoặc have been + quá khứ phân từ: The email has been sent. Dùng has với chủ ngữ số ít, have với chủ ngữ số nhiều. Các từ tomorrow, next week thường gợi ý tương lai; already, just, recently thường gợi ý hiện tại hoàn thành.',
 'ADVANCED',TRUE);

UPDATE lessons SET title='Who, which, that trong mệnh đề quan hệ',
  summary='Nối ý và bổ nghĩa cho người hoặc vật',
  theory='Mệnh đề quan hệ xác định giúp nhận ra người hoặc vật đang nói đến. Who thay cho người, which thay cho vật; that có thể thay cho cả hai trong mệnh đề xác định. Ví dụ: The woman who teaches me is kind. The book which I bought is useful. Đại từ quan hệ làm chủ ngữ của mệnh đề phụ thì không được bỏ. Khi làm tân ngữ trong mệnh đề xác định, có thể lược bỏ who, which hoặc that.',
  difficulty='INTERMEDIATE', published=TRUE
WHERE topic_slug='relative-clauses' AND ordinal_no=0;
INSERT INTO lessons(topic_slug,ordinal_no,title,summary,theory,difficulty,published) VALUES
('relative-clauses',1,'Whose, where, when và mệnh đề không xác định','Diễn tả sở hữu, nơi chốn, thời gian và thông tin bổ sung',
 'Whose diễn tả sở hữu: The artist whose paintings we saw is famous. Where chỉ nơi chốn: This is the house where I grew up. When chỉ thời gian: Monday is the day when we meet. Mệnh đề không xác định thêm thông tin phụ và được ngăn bằng dấu phẩy: My brother, who lives in Hue, is a doctor. Không dùng that trong mệnh đề không xác định.',
 'ADVANCED',TRUE);

SET @basic0 = (SELECT id FROM lessons WHERE topic_slug='basic-tenses' AND ordinal_no=0);
SET @basic1 = (SELECT id FROM lessons WHERE topic_slug='basic-tenses' AND ordinal_no=1);
SET @passive0 = (SELECT id FROM lessons WHERE topic_slug='passive-voice' AND ordinal_no=0);
SET @passive1 = (SELECT id FROM lessons WHERE topic_slug='passive-voice' AND ordinal_no=1);
SET @relative0 = (SELECT id FROM lessons WHERE topic_slug='relative-clauses' AND ordinal_no=0);
SET @relative1 = (SELECT id FROM lessons WHERE topic_slug='relative-clauses' AND ordinal_no=1);

INSERT INTO questions(lesson_id,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,published) VALUES
(@basic0,'She ___ to school every day.','go','goes','is going','went','B','Every day chỉ thói quen; she đi với goes.',TRUE),
(@basic0,'Look! It ___ outside.','rains','rained','is raining','rain','C','Look báo hiệu việc đang diễn ra; dùng is raining.',TRUE),
(@basic0,'My father ___ coffee every morning.','drinks','is drinking','drank','drink','A','Every morning chỉ thói quen; he đi với drinks.',TRUE),
(@basic0,'They ___ football right now.','play','played','plays','are playing','D','Right now yêu cầu hiện tại tiếp diễn.',TRUE),
(@basic0,'We ___ English on Mondays.','are studying','study','studied','studies','B','On Mondays là lịch lặp lại; dùng hiện tại đơn.',TRUE),
(@basic0,'Listen! The baby ___.','cries','cried','is crying','cry','C','Listen gợi ý hành động đang xảy ra.',TRUE),
(@basic0,'He ___ in Hanoi, but this week he is staying in Da Nang.','lives','is living','lived','live','A','Nơi ở thường xuyên dùng hiện tại đơn: lives.',TRUE),
(@basic0,'Water ___ at 100 degrees Celsius.','is boiling','boiled','boil','boils','D','Sự thật khoa học dùng hiện tại đơn.',TRUE),
(@basic0,'Why ___ you looking at me now?','do','are','did','is','B','Hiện tại tiếp diễn với you dùng are.',TRUE),
(@basic0,'I usually ___ breakfast at seven.','am having','had','have','has','C','Usually chỉ thói quen; I dùng have.',TRUE),

(@basic1,'Yesterday I ___ to the market.','go','gone','was going','went','D','Yesterday chỉ sự kiện hoàn tất; quá khứ của go là went.',TRUE),
(@basic1,'At eight last night, she ___ dinner.','was cooking','cooked','cooks','is cooking','A','Hành động đang diễn ra tại thời điểm quá khứ dùng was cooking.',TRUE),
(@basic1,'When the phone rang, I ___.','sleep','was sleeping','am sleeping','slept','B','Hành động dài đang diễn ra khi chuông reo dùng quá khứ tiếp diễn.',TRUE),
(@basic1,'They ___ the match last Sunday.','win','were winning','won','wins','C','Last Sunday chỉ thời điểm quá khứ đã hoàn tất.',TRUE),
(@basic1,'While he ___ home, it started to rain.','walks','walked','is walking','was walking','D','While đi với hành động đang diễn ra trong quá khứ.',TRUE),
(@basic1,'We ___ when the teacher arrived.','were talking','talk','are talking','talked','A','Việc nói chuyện đang diễn ra khi giáo viên tới.',TRUE),
(@basic1,'Did you ___ the film yesterday?','watched','watch','watching','watches','B','Sau did dùng động từ nguyên mẫu.',TRUE),
(@basic1,'She did not ___ late last night.','arrived','arrives','arrive','arriving','C','Sau did not dùng động từ nguyên mẫu.',TRUE),
(@basic1,'The lights went out while we ___.','study','studied','are studying','were studying','D','Hành động đang xảy ra lúc mất điện dùng were studying.',TRUE),
(@basic1,'He ___ his keys yesterday.','lost','loses','was losing','lose','A','Yesterday và hành động hoàn tất dùng lost.',TRUE),

(@passive0,'English ___ in many countries.','speaks','is spoken','was speaking','has spoken','B','Hiện tại bị động: is + quá khứ phân từ spoken.',TRUE),
(@passive0,'The window ___ yesterday.','is breaking','broke','was broken','were broken','C','Yesterday yêu cầu quá khứ bị động: was broken.',TRUE),
(@passive0,'These cakes ___ every morning.','bake','is baked','were baked','are baked','D','Chủ ngữ số nhiều và thói quen: are baked.',TRUE),
(@passive0,'The letter ___ last night.','was sent','is sent','sent','were sent','A','Quá khứ bị động với chủ ngữ số ít: was sent.',TRUE),
(@passive0,'This room ___ every day.','cleaned','is cleaned','was cleaning','are cleaned','B','Hiện tại bị động với room số ít: is cleaned.',TRUE),
(@passive0,'The bridge ___ in 1990.','is building','builds','was built','were built','C','Mốc 1990 yêu cầu quá khứ bị động: was built.',TRUE),
(@passive0,'The documents ___ yesterday.','is signed','signs','was signed','were signed','D','Documents số nhiều ở quá khứ: were signed.',TRUE),
(@passive0,'Rice ___ in Vietnam.','is grown','grows','was growing','are grown','A','Nhấn mạnh cây lúa được trồng: is grown.',TRUE),
(@passive0,'The cars ___ last week.','was repaired','were repaired','repair','are repairing','B','Cars số nhiều, last week là quá khứ.',TRUE),
(@passive0,'This song ___ by many students.','sing','are sung','is sung','was singing','C','Chủ ngữ song số ít, bị động hiện tại: is sung.',TRUE),

(@passive1,'The project ___ next month.','completes','has completed','was completed','will be completed','D','Next month yêu cầu bị động tương lai: will be completed.',TRUE),
(@passive1,'The email ___ already ___.','has been sent','will be sent','is sending','was sending','A','Already gợi ý hiện tại hoàn thành bị động.',TRUE),
(@passive1,'The rooms ___ by Friday.','have cleaned','will be cleaned','are cleaning','were cleaning','B','By Friday nói về dự kiến tương lai; rooms sẽ được dọn.',TRUE),
(@passive1,'The cake ___ just ___.','is baking','will bake','has been baked','have been baked','C','Just gợi ý hiện tại hoàn thành; cake số ít dùng has.',TRUE),
(@passive1,'The rules ___ soon.','will announce','have announced','is announced','will be announced','D','Rules là đối tượng được công bố trong tương lai.',TRUE),
(@passive1,'Several trees ___ planted this year.','have been','has been','will','are being','A','Several trees số nhiều; hiện tại hoàn thành bị động dùng have been.',TRUE),
(@passive1,'The report ___ tomorrow.','has been delivered','will be delivered','delivered','is delivering','B','Tomorrow gợi ý bị động tương lai.',TRUE),
(@passive1,'The books ___ already ___.','has been returned','will return','have been returned','are returning','C','Books số nhiều; already gợi ý have been returned.',TRUE),
(@passive1,'This problem ___ in the next meeting.','has discussed','will discuss','was discussing','will be discussed','D','Problem được thảo luận trong tương lai.',TRUE),
(@passive1,'The bridge ___ recently ___.','has been repaired','have been repaired','will be repaired','is repairing','A','Recently gợi ý hiện tại hoàn thành; bridge số ít dùng has.',TRUE),

(@relative0,'The woman ___ teaches me is kind.','which','who','where','when','B','Who thay cho người và làm chủ ngữ mệnh đề quan hệ.',TRUE),
(@relative0,'The book ___ I bought is useful.','who','where','which','when','C','Which thay cho vật: the book.',TRUE),
(@relative0,'The only thing ___ matters is honesty.','where','whose','who','that','D','That phù hợp sau the only thing.',TRUE),
(@relative0,'The student ___ answered first won a prize.','who','which','where','when','A','Who thay cho the student.',TRUE),
(@relative0,'The phone ___ you lent me works well.','who','which','where','when','B','Which thay cho the phone.',TRUE),
(@relative0,'Everything ___ I told you is true.','who','where','that','whose','C','That dùng sau everything trong mệnh đề xác định.',TRUE),
(@relative0,'The man ___ lives next door is a pilot.','which','where','when','who','D','Who thay cho the man.',TRUE),
(@relative0,'The flowers ___ grow here are rare.','which','who','where','when','A','Which thay cho flowers.',TRUE),
(@relative0,'The teacher ___ we met was helpful.','which','who','where','when','B','Who thay cho người; ở đây là tân ngữ của met.',TRUE),
(@relative0,'The song ___ you played was beautiful.','who','where','that','whose','C','That thay cho vật trong mệnh đề xác định.',TRUE),

(@relative1,'The artist ___ paintings we saw is famous.','who','which','where','whose','D','Whose diễn tả sở hữu: tranh của nghệ sĩ.',TRUE),
(@relative1,'This is the house ___ I grew up.','where','when','whose','who','A','Where thay cho địa điểm.',TRUE),
(@relative1,'Monday is the day ___ we meet.','where','when','whose','who','B','When thay cho thời gian.',TRUE),
(@relative1,'My brother, ___ lives in Hue, is a doctor.','that','where','who','whose','C','Mệnh đề không xác định về người dùng who, không dùng that.',TRUE),
(@relative1,'Paris, ___ is in France, attracts visitors.','that','who','where','which','D','Mệnh đề không xác định về vật hoặc địa điểm như một sự vật dùng which.',TRUE),
(@relative1,'The woman ___ son won the prize is smiling.','whose','who','which','when','A','Whose son nghĩa là người con trai của cô ấy.',TRUE),
(@relative1,'Do you remember the day ___ we first met?','where','when','whose','who','B','When bổ nghĩa cho the day.',TRUE),
(@relative1,'The cafe ___ we met has closed.','when','whose','where','who','C','Where bổ nghĩa cho the cafe.',TRUE),
(@relative1,'Lan, ___ father is a pilot, loves travel.','who','that','which','whose','D','Whose chỉ quan hệ sở hữu giữa Lan và cha.',TRUE),
(@relative1,'Our school, ___ was built in 2000, is large.','which','that','who','where','A','Mệnh đề không xác định sau dấu phẩy dùng which, không dùng that.',TRUE);
